import type { Geometry, Position } from 'geojson';
import type { AppFeature, LayerDataSource, QueryParams, QueryResult } from './types.ts';
import { combineAnd, type FilterNode } from './filter/ast.ts';
import { toEsriWhere } from './filter/toEsriWhere.ts';

export interface ArcGisDataSourceConfig {
  /** Layer endpoint: `…/FeatureServer/0` or `…/MapServer/0`. */
  url: string;
  /** Property holding the object id, used as a fallback when the GeoJSON feature has no `id`. */
  idField?: string;
  /** Always AND-combined with the per-query filter. */
  baseFilter?: FilterNode;
  /** Allowlist of queryable columns; filters on any other field throw. Omit to skip the check. */
  knownFields?: readonly string[];
}

interface EsriGeoJsonResponse {
  features?: {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry?: Geometry | null;
  }[];
}

interface EsriCountResponse {
  count?: number;
}

interface EsriPolygon {
  rings: Position[][];
  spatialReference: { wkid: number };
}

/** ArcGIS REST FeatureServer/MapServer adapter. Never import directly outside `src/lib/mapping/data` — use `createDataSource`. */
export class ArcGisDataSource implements LayerDataSource {
  readonly #config: ArcGisDataSourceConfig;
  readonly #fetch: typeof fetch;
  readonly #knownFields: ReadonlySet<string> | undefined;

  constructor(config: ArcGisDataSourceConfig, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.#config = config;
    this.#fetch = fetchFn;
    this.#knownFields = config.knownFields ? new Set(config.knownFields) : undefined;
  }

  async query(params: QueryParams, signal?: AbortSignal): Promise<QueryResult> {
    const where = this.#buildWhere(params);
    const spatial = params.geometry !== undefined;

    const pageSearch = new URLSearchParams({
      f: 'geojson',
      where,
      outFields: params.outFields?.join(',') ?? '*',
      returnGeometry: 'true',
      outSR: '4326',
    });
    if (params.page) {
      pageSearch.set('resultOffset', String(params.page.offset));
      pageSearch.set('resultRecordCount', String(params.page.limit));
    }
    if (params.geometry) this.#applySpatial(pageSearch, params.geometry);

    // Total runs in parallel with the page query: same constraints, count only.
    const countSearch = new URLSearchParams({
      f: 'json',
      where,
      returnCountOnly: 'true',
    });
    if (params.geometry) this.#applySpatial(countSearch, params.geometry);

    const [pageData, countData] = await Promise.all([
      this.#request<EsriGeoJsonResponse>(pageSearch, spatial, signal),
      this.#request<EsriCountResponse>(countSearch, spatial, signal),
    ]);

    const features = (pageData.features ?? []).map(f => this.#toAppFeature(f));
    const offset = params.page?.offset ?? 0;
    return { features, total: countData.count ?? offset + features.length };
  }

  async getById(id: string, signal?: AbortSignal): Promise<AppFeature | undefined> {
    const search = new URLSearchParams({
      f: 'geojson',
      objectIds: id,
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
    });
    const data = await this.#request<EsriGeoJsonResponse>(search, false, signal);
    const first = data.features?.[0];
    return first ? this.#toAppFeature(first) : undefined;
  }

  #buildWhere(params: QueryParams): string {
    const filter = combineAnd(this.#config.baseFilter, params.filter);
    return filter ? toEsriWhere(filter, { knownFields: this.#knownFields }) : '1=1';
  }

  #applySpatial(search: URLSearchParams, geometry: Geometry): void {
    search.set('geometry', JSON.stringify(geojsonToEsriPolygon(geometry)));
    search.set('geometryType', 'esriGeometryPolygon');
    search.set('inSR', '4326');
    search.set('spatialRel', 'esriSpatialRelIntersects');
  }

  /** GET normally; POST form-encoded when a spatial geometry is attached (can exceed GET URL limits). */
  async #request<T>(search: URLSearchParams, post: boolean, signal?: AbortSignal): Promise<T> {
    const url = `${this.#config.url}/query`;
    const res = post
      ? await this.#fetch(url, { method: 'POST', body: search, signal })
      : await this.#fetch(`${url}?${search}`, { signal });
    if (!res.ok) throw new Error(`ArcGIS request failed: HTTP ${res.status}`);
    return await res.json() as T;
  }

  #toAppFeature(f: NonNullable<EsriGeoJsonResponse['features']>[number]): AppFeature {
    const properties = f.properties ?? {};
    const idField = this.#config.idField;
    const id = f.id ?? (idField ? properties[idField] : undefined);
    return {
      id: String(id ?? ''),
      properties,
      geometry: f.geometry ?? undefined,
    };
  }
}

/** Converts GeoJSON Polygon/MultiPolygon (lon/lat) to an Esri polygon (rings, wkid 4326). */
export function geojsonToEsriPolygon(geometry: Geometry): EsriPolygon {
  switch (geometry.type) {
    case 'Polygon':
      return { rings: geometry.coordinates, spatialReference: { wkid: 4326 } };
    case 'MultiPolygon':
      return { rings: geometry.coordinates.flat(1) as Position[][], spatialReference: { wkid: 4326 } };
    default:
      throw new Error(`geojsonToEsriPolygon: unsupported geometry type "${geometry.type}"`);
  }
}
