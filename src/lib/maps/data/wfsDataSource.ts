import type { Geometry, Position } from 'geojson';
import type { AppFeature, LayerDataSource, QueryParams, QueryResult } from './types.ts';
import { combineAnd, type FilterNode } from './filter/ast.ts';
import { toCql } from './filter/toCql.ts';

export interface WfsDataSourceConfig {
  /** GeoServer WFS endpoint, e.g. `https://example.com/geoserver/wfs`. */
  url: string;
  typeName: string;
  /** Property to fall back to when the GeoJSON feature has no `id`. */
  idField?: string;
  /** Always AND-combined with the per-query filter. */
  baseFilter?: FilterNode;
  /** Geometry attribute used in spatial CQL. Default `'the_geom'`. */
  geometryName?: string;
  /** Allowlist of queryable columns; filters on any other field throw. Omit to skip the check. */
  knownFields?: readonly string[];
}

interface WfsFeatureCollection {
  features?: {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry?: Geometry | null;
  }[];
  numberMatched?: number | string;
  totalFeatures?: number | string;
}

/** GeoServer WFS 2.0 adapter. Never import directly outside `src/lib/mapping/data` — use `createDataSource`. */
export class WfsDataSource implements LayerDataSource {
  readonly #config: WfsDataSourceConfig;
  readonly #fetch: typeof fetch;
  readonly #knownFields: ReadonlySet<string> | undefined;

  constructor(config: WfsDataSourceConfig, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.#config = config;
    this.#fetch = fetchFn;
    this.#knownFields = config.knownFields ? new Set(config.knownFields) : undefined;
  }

  async query(params: QueryParams, signal?: AbortSignal): Promise<QueryResult> {
    const search = this.#baseParams();

    if (params.page) {
      search.set('count', String(params.page.limit));
      search.set('startIndex', String(params.page.offset));
    }

    const cql = this.#buildCql(params);
    if (cql) search.set('CQL_FILTER', cql);

    const data = await this.#getJson(search, signal);
    const features = (data.features ?? []).map(f => this.#toAppFeature(f));
    const offset = params.page?.offset ?? 0;
    return { features, total: parseTotal(data, offset, features.length, params.page?.limit) };
  }

  async getById(id: string, signal?: AbortSignal): Promise<AppFeature | undefined> {
    const search = this.#baseParams();
    search.set('featureID', id);
    const data = await this.#getJson(search, signal);
    const first = data.features?.[0];
    return first ? this.#toAppFeature(first) : undefined;
  }

  /**
   * AND-combination of baseFilter, the per-query filter, and — when a query
   * geometry is present — an INTERSECTS term. Attribute filters compile via
   * `toCql` (groups come back parenthesized, so the string-level AND is safe).
   */
  #buildCql(params: QueryParams): string | undefined {
    const parts: string[] = [];
    const attrFilter = combineAnd(this.#config.baseFilter, params.filter);
    if (attrFilter) parts.push(toCql(attrFilter, { knownFields: this.#knownFields }));
    if (params.geometry) {
      const geometryName = this.#config.geometryName ?? 'the_geom';
      parts.push(`INTERSECTS(${geometryName}, ${geojsonToWkt(params.geometry)})`);
    }
    return parts.length ? parts.join(' AND ') : undefined;
  }

  #baseParams(): URLSearchParams {
    return new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: this.#config.typeName,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
    });
  }

  async #getJson(search: URLSearchParams, signal?: AbortSignal): Promise<WfsFeatureCollection> {
    const res = await this.#fetch(`${this.#config.url}?${search}`, { signal });
    if (!res.ok) throw new Error(`WFS request failed: HTTP ${res.status}`);
    return await res.json() as WfsFeatureCollection;
  }

  #toAppFeature(f: NonNullable<WfsFeatureCollection['features']>[number]): AppFeature {
    const properties = f.properties ?? {};
    const id = f.id ?? properties[this.#config.idField ?? ''];
    return {
      id: String(id ?? ''),
      properties,
      geometry: f.geometry ?? undefined,
    };
  }
}

/**
 * WFS 2.0 allows `numberMatched: 'unknown'`. When no numeric total is
 * available, derive one from the page shape: a partial page is exact, but a
 * FULL page means at least one more feature may exist — report one extra so
 * the pager keeps "Next" enabled instead of treating this as the last page.
 * (The displayed count under-reports until a partial page is reached.)
 */
function parseTotal(data: WfsFeatureCollection, offset: number, count: number, limit?: number): number {
  for (const candidate of [data.numberMatched, data.totalFeatures]) {
    if (typeof candidate === 'number') return candidate;
  }
  const mayHaveMore = limit !== undefined && count === limit && count > 0;
  return offset + count + (mayHaveMore ? 1 : 0);
}

/** Converts Point/Polygon/MultiPolygon GeoJSON (lon/lat) to WKT. */
export function geojsonToWkt(geometry: Geometry): string {
  switch (geometry.type) {
    case 'Point':
      return `POINT (${position(geometry.coordinates)})`;
    case 'Polygon':
      return `POLYGON ${polygonBody(geometry.coordinates)}`;
    case 'MultiPolygon':
      return `MULTIPOLYGON (${geometry.coordinates.map(polygonBody).join(', ')})`;
    default:
      throw new Error(`geojsonToWkt: unsupported geometry type "${geometry.type}"`);
  }
}

const position = (p: Position): string => `${p[0]} ${p[1]}`;
const ring = (r: Position[]): string => `(${r.map(position).join(', ')})`;
const polygonBody = (rings: Position[][]): string => `(${rings.map(ring).join(', ')})`;
