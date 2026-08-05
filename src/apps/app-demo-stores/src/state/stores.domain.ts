import { Store } from "@mini/lib/core";
import type { LayersSlice, UiSlice, ViewportSlice, AppState } from "./keys.ts";
import type { LayerConfig } from "../config/types.ts";
import * as actions from "./actions.ts";
import { seedLayers, seedUi, seedViewport, mergeDefined } from "./seed.ts";

class LayersStore extends Store<LayersSlice> {
  setVisible(id: string, visible: boolean): void {
    actions.setVisible(this, id, visible);
  }

  toggleVisible(id: string): void {
    actions.toggleVisible(this, id);
  }

  setVisibleMany(ids: string[], visible: boolean): void {
    actions.setVisibleMany(this, ids, visible);
  }

  setVariable(id: string, variableId: string): void {
    actions.setVariable(this, id, variableId);
  }
}

class UiStore extends Store<UiSlice> {
  setExpanded(ids: string[]): void {
    actions.setExpanded(this, ids);
  }

  setLegendExpanded(ids: string[]): void {
    actions.setLegendExpanded(this, ids);
  }

  setTableLayer(id: string | null): void {
    actions.setTableLayer(this, id);
  }

  setPage(n: number): void {
    actions.setPage(this, n);
  }
}

class ViewportStore extends Store<ViewportSlice> {
  setView(next: { center: [number, number]; zoom: number }): void {
    actions.setView(this, next);
  }
}

export interface DomainStores {
  layers: LayersStore;
  ui: UiStore;
  viewport: ViewportStore;
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
