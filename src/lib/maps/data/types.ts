import type { Geometry } from 'geojson';
import type { FilterNode } from './filter/ast.ts';

/** Backend-neutral feature: plain properties + optional GeoJSON geometry in EPSG:4326. */
export interface AppFeature {
  id: string;
  properties: Record<string, unknown>;
  geometry?: Geometry;
}

export interface QueryPage {
  offset: number;
  limit: number;
}

export interface QueryParams {
  /** Widget/user filter, AND-combined with the adapter's configured baseFilter. */
  filter?: FilterNode;
  /** Spatial intersects constraint, GeoJSON in EPSG:4326. */
  geometry?: Geometry;
  page?: QueryPage;
  outFields?: string[];
}

export interface QueryResult {
  features: AppFeature[];
  /** Total matching the constraints, ignoring paging. */
  total: number;
}

/**
 * The data port (ADR-4). Widgets query through this interface only — adapter
 * classes and backend syntax stay inside `src/lib/mapping/data`.
 */
export interface LayerDataSource {
  query(params: QueryParams, signal?: AbortSignal): Promise<QueryResult>;
  getById(id: string, signal?: AbortSignal): Promise<AppFeature | undefined>;
}
