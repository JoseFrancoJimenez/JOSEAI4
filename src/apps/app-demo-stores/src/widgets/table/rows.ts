import type { LayerConfig } from "../../config/types.ts";

/** Fixed page size — a module constant per the task brief, not a store value. */
export const TABLE_PAGE_SIZE = 10;

interface GeoJsonFeature {
  properties?: Record<string, unknown>;
}

interface EsriFeature {
  attributes?: Record<string, unknown>;
}

/**
 * Fetches a layer's full feature set from its static source file and extracts each feature's
 * attribute record — GeoJSON `properties`, Esri JSON `attributes` — the row data the table
 * renders.
 *
 * Deviation from the task brief, flagged: `src/lib/maps/data/{arcgisDataSource,wfsDataSource}.ts`
 * expect `source.kind: 'wfs' | 'arcgis'` (a live, server-paginated backend), but this app's real
 * layer configs carry `source.type: 'geojson' | 'esrijson'` pointing at static files under
 * `public/testData/sourceLayers/` — a config shape those classes don't accept at all (see the
 * Task 8 review's noted gap). There is no live server to page against here, so this fetches the
 * whole static file once and paginates client-side; it does not reimplement server-side paging,
 * because none exists for this data shape.
 */
export async function fetchLayerRows(config: LayerConfig, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const response = await fetch(config.source.url, { signal });
  if (!response.ok) throw new Error(`Failed to load "${config.source.url}": ${response.status}`);
  const data: unknown = await response.json();
  const features = Array.isArray((data as { features?: unknown })?.features)
    ? (data as { features: unknown[] }).features
    : [];

  return config.source.type === "esrijson"
    ? features.map((f) => (f as EsriFeature).attributes ?? {})
    : features.map((f) => (f as GeoJsonFeature).properties ?? {});
}

/** Client-side page slice — 1-indexed, matching `stores.ui.tablePage`. */
export function paginate<T>(rows: T[], page: number, pageSize: number = TABLE_PAGE_SIZE): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
