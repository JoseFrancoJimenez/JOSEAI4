import type { LayerConfig } from "../config/types.ts";
import type { AppState, LayerState } from "./keys.ts";
import type { ShareState } from "./selectors.ts";
import { seedLayers } from "./seed.ts";

/**
 * Reconciles a decoded (possibly partial, already-invalid-filtered) share-link state against the
 * config-seeded defaults, **per layer** — never a wholesale replace of `layersById`/
 * `variableByLayerId`. `decodeShareState` may drop some entries (an unknown id, a variable the
 * layer doesn't have); a layer missing from the decoded partial must fall back to its config
 * default, not disappear from the record or lose its active variable. `layerOrder` is never
 * touched here — the share link doesn't encode a custom order, so it stays config-derived.
 */
export function buildRestoredState(configs: LayerConfig[], decoded: Partial<ShareState>): Partial<AppState> {
  const seeded = seedLayers(configs);
  const result: Partial<AppState> = {};

  if (decoded.visibleIds) result.layersById = restoredVisibility(seeded.layersById, decoded.visibleIds);
  if (decoded.variableByLayerId) {
    result.variableByLayerId = { ...seeded.variableByLayerId, ...decoded.variableByLayerId };
  }

  if (decoded.expandedIds) result.expandedIds = decoded.expandedIds;
  if (decoded.expandedLegendIds) result.expandedLegendIds = decoded.expandedLegendIds;
  if (decoded.tableLayerId !== undefined) result.tableLayerId = decoded.tableLayerId;
  if (decoded.tablePage !== undefined) result.tablePage = decoded.tablePage;
  if (decoded.center) result.center = decoded.center;
  if (decoded.zoom !== undefined) result.zoom = decoded.zoom;

  return result;
}

function restoredVisibility(seeded: Record<string, LayerState>, visibleIds: string[]): Record<string, LayerState> {
  const visibleSet = new Set(visibleIds);
  const layersById: Record<string, LayerState> = {};
  for (const [id, layer] of Object.entries(seeded)) {
    layersById[id] = { ...layer, visible: visibleSet.has(id) };
  }
  return layersById;
}
