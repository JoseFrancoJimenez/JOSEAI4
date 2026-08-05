import { Store } from "@mini/lib/core";
import type { AppState } from "./keys.ts";
import type { LayerConfig } from "../config/types.ts";
import type { AppStores } from "./facade.ts";
import * as actions from "./actions.ts";
import { seedLayers, seedUi, seedViewport, mergeDefined } from "./seed.ts";

/** Same action methods, same key names as the domain stores (Task 10) — both wirings call the
 * identical shared functions in actions.ts, so behavior is provably equivalent rather than
 * hand-kept in sync. */
class AppStore extends Store<AppState> {
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

  setView(next: { center: [number, number]; zoom: number }): void {
    actions.setView(this, next);
  }
}

function seedAppState(configs: LayerConfig[], initial?: Partial<AppState>): AppState {
  const layers = mergeDefined(seedLayers(configs), initial, ["layersById", "layerOrder", "variableByLayerId"]);
  const ui = mergeDefined(seedUi(), initial, ["expandedIds", "expandedLegendIds", "tableLayerId", "tablePage"]);
  const viewport = mergeDefined(seedViewport(), initial, ["center", "zoom"]);
  return { ...layers, ...ui, ...viewport };
}

/** Factory, not a module singleton — keeps tests isolated. Returns the same `AppStore` instance
 * three times, typed as `AppStores` — the facade both wirings satisfy. */
export function createSingleStores(configs: LayerConfig[], initial?: Partial<AppState>): AppStores {
  const app = new AppStore(seedAppState(configs, initial));
  return { layers: app, ui: app, viewport: app };
}

export { AppStore };
