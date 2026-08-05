import type { LayerConfig } from "../config/types.ts";
import type { LayerState, LayersSlice, UiSlice, ViewportSlice } from "./keys.ts";

/** Default view: centered on Canada (lon/lat), matching the map controller's initial view. */
export const DEFAULT_CENTER: [number, number] = [-96, 62];
export const DEFAULT_ZOOM = 4;
export const DEFAULT_TABLE_PAGE = 1;

export function seedLayers(configs: LayerConfig[]): LayersSlice {
  const layersById: Record<string, LayerState> = {};
  const variableByLayerId: Record<string, string> = {};
  const layerOrder: string[] = [];

  for (const config of configs) {
    layersById[config.id] = { id: config.id, visible: config.visible };
    variableByLayerId[config.id] = config.default_variable;
    layerOrder.push(config.id);
  }

  return { layersById, layerOrder, variableByLayerId };
}

export function seedUi(): UiSlice {
  return { expandedIds: [], expandedLegendIds: [], tableLayerId: null, tablePage: DEFAULT_TABLE_PAGE };
}

export function seedViewport(): ViewportSlice {
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
}

/** Shallow-merges only the defined (non-`undefined`) keys of `overrides` onto `seed`, restricted
 * to `keys` — so a combined `Partial<AppState>` override never bleeds unrelated slices' fields
 * into this one. Shared by both wirings' factories so seeding stays provably identical. */
export function mergeDefined<T extends object, K extends keyof T>(
  seed: T,
  overrides: Partial<T> | undefined,
  keys: K[],
): T {
  if (!overrides) return seed;
  const result = { ...seed };
  for (const key of keys) {
    const value = overrides[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}
