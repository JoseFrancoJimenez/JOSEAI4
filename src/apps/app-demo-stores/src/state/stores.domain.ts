import { Store } from "@mini/lib/core";
import type { LayerState, LayersSlice, UiSlice, ViewportSlice, AppState } from "./keys.ts";
import type { LayerConfig } from "../config/types.ts";

/** Default view: centered on Canada (lon/lat), matching the map controller's initial view. */
const DEFAULT_CENTER: [number, number] = [-96, 62];
const DEFAULT_ZOOM = 4;
const DEFAULT_TABLE_PAGE = 1;

class LayersStore extends Store<LayersSlice> {
  setVisible(id: string, visible: boolean): void {
    const current = this.get("layersById");
    const layer = current[id];
    if (!layer || layer.visible === visible) return;
    this.set("layersById", { ...current, [id]: { ...layer, visible } });
  }

  toggleVisible(id: string): void {
    const layer = this.get("layersById")[id];
    if (!layer) return;
    this.setVisible(id, !layer.visible);
  }

  /** Cascade path: flips N layers and emits `layersById` exactly once. */
  setVisibleMany(ids: string[], visible: boolean): void {
    const current = this.get("layersById");
    let changed = false;
    const next: Record<string, LayerState> = { ...current };
    for (const id of ids) {
      const layer = current[id];
      if (layer && layer.visible !== visible) {
        next[id] = { ...layer, visible };
        changed = true;
      }
    }
    if (changed) this.set("layersById", next);
  }

  setVariable(id: string, variableId: string): void {
    const current = this.get("variableByLayerId");
    if (current[id] === variableId) return;
    this.set("variableByLayerId", { ...current, [id]: variableId });
  }
}

class UiStore extends Store<UiSlice> {
  /** Expansion echo-guarding (compare contents before writing) is the widget's job, not the
   * store's — a freshly built array here is expected to always be a new reference. */
  setExpanded(ids: string[]): void {
    this.set("expandedIds", [...ids]);
  }

  setLegendExpanded(ids: string[]): void {
    this.set("expandedLegendIds", [...ids]);
  }

  setTableLayer(id: string | null): void {
    this.set("tableLayerId", id);
  }

  setPage(n: number): void {
    this.set("tablePage", n);
  }
}

class ViewportStore extends Store<ViewportSlice> {
  setView(next: { center: [number, number]; zoom: number }): void {
    this.batch(() => {
      this.set("center", next.center);
      this.set("zoom", next.zoom);
    });
  }
}

export interface DomainStores {
  layers: LayersStore;
  ui: UiStore;
  viewport: ViewportStore;
}

/** Shallow-merges only the defined (non-`undefined`) keys of `overrides` onto `seed`, restricted
 * to `keys` — so a combined `Partial<AppState>` override never bleeds unrelated slices' fields
 * into this one. */
function mergeDefined<T extends object, K extends keyof T>(
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

function seedLayers(configs: LayerConfig[]): LayersSlice {
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

function seedUi(): UiSlice {
  return { expandedIds: [], expandedLegendIds: [], tableLayerId: null, tablePage: DEFAULT_TABLE_PAGE };
}

function seedViewport(): ViewportSlice {
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
}

/** Factory, not a module singleton — keeps tests isolated. `initial` overrides individual
 * slice fields with restored share-link state; anything omitted falls back to config-derived
 * (layers) or fixed (ui/viewport) defaults. */
export function createDomainStores(configs: LayerConfig[], initial?: Partial<AppState>): DomainStores {
  const layers = new LayersStore(
    mergeDefined(seedLayers(configs), initial, ["layersById", "layerOrder", "variableByLayerId"]),
  );
  const ui = new UiStore(
    mergeDefined(seedUi(), initial, ["expandedIds", "expandedLegendIds", "tableLayerId", "tablePage"]),
  );
  const viewport = new ViewportStore(mergeDefined(seedViewport(), initial, ["center", "zoom"]));

  return { layers, ui, viewport };
}

export { LayersStore, UiStore, ViewportStore };
