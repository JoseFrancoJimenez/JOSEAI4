import type { Feature, FeatureCollection } from 'geojson';
import type { AppFeature, LayerDataSource, QueryParams, QueryResult } from './types.ts';
import { combineAnd, type FilterNode } from './filter/ast.ts';
import { toPredicate } from './filter/toPredicate.ts';

export interface GeoJsonDataSourceConfig {
  /** URL returning a GeoJSON FeatureCollection. Fetched once, then cached. */
  url: string;
  /** Property to fall back to for the feature id when the GeoJSON feature has none. */
  idField?: string;
  /** Always AND-combined with the per-query filter. */
  baseFilter?: FilterNode;
}

/**
 * In-memory adapter over a static GeoJSON FeatureCollection: fetches the file
 * once, caches it, and answers queries client-side (attribute filter + paging).
 * The spatial `geometry` constraint is ignored. Suited to small local datasets;
 * for server-side paging use the ArcGIS/WFS adapters. Never import directly
 * outside `src/lib/maps/data` — use `createDataSource`.
 */
export class GeoJsonDataSource implements LayerDataSource {
  readonly #config: GeoJsonDataSourceConfig;
  readonly #fetch: typeof fetch;
  #features: Promise<AppFeature[]> | undefined;

  constructor(config: GeoJsonDataSourceConfig, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  async query(params: QueryParams, signal?: AbortSignal): Promise<QueryResult> {
    let features = await this.#load(signal);

    const filter = combineAnd(this.#config.baseFilter, params.filter);
    if (filter) {
      const matches = toPredicate(filter);
      features = features.filter(f => matches(f.properties));
    }

    const total = features.length;
    const offset = params.page?.offset ?? 0;
    const limit = params.page?.limit ?? total;
    return { features: features.slice(offset, offset + limit), total };
  }

  async getById(id: string, signal?: AbortSignal): Promise<AppFeature | undefined> {
    const features = await this.#load(signal);
    return features.find(f => f.id === id);
  }

  /** Loads once and caches. A failed load clears the cache so the next call retries. */
  #load(signal?: AbortSignal): Promise<AppFeature[]> {
    if (!this.#features) {
      this.#features = this.#fetchFeatures(signal).catch(err => {
        this.#features = undefined;
        throw err;
      });
    }
    return this.#features;
  }

  async #fetchFeatures(signal?: AbortSignal): Promise<AppFeature[]> {
    const res = await this.#fetch(this.#config.url, { signal });
    if (!res.ok) throw new Error(`GeoJSON request failed: HTTP ${res.status}`);
    const collection = await res.json() as FeatureCollection;
    return (collection.features ?? []).map((f, i) => this.#toAppFeature(f, i));
  }

  #toAppFeature(feature: Feature, index: number): AppFeature {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const idField = this.#config.idField;
    const rawId = feature.id ?? (idField ? properties[idField] : undefined) ?? index;
    return {
      id: String(rawId),
      properties,
      geometry: feature.geometry ?? undefined,
    };
  }
}
