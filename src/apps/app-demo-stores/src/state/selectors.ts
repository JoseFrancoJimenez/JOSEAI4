import type { AppStores } from "./facade.ts";

/**
 * Plain functions over `AppStores` — no memoization, no subscriptions. If a concrete need for a
 * memoized/derived subscription ever shows up (e.g. a widget re-deriving on every unrelated
 * store change becomes a measured problem), the upgrade path is a memoized selector wrapper
 * around `subscribeMany`, not a `computed` primitive in the store itself — see store-brief.md.
 */

export function selectVisibleIds(stores: AppStores): string[] {
  const layersById = stores.layers.get("layersById");
  return stores.layers.get("layerOrder").filter((id) => layersById[id]?.visible === true);
}

export function selectHiddenIds(stores: AppStores): string[] {
  const layersById = stores.layers.get("layersById");
  return stores.layers.get("layerOrder").filter((id) => layersById[id]?.visible !== true);
}

/** Visible layer ids in reversed `layerOrder` — the TOC/legend display order (top-drawn first). */
export function selectOrderedVisibleIds(stores: AppStores): string[] {
  const layersById = stores.layers.get("layersById");
  return [...stores.layers.get("layerOrder")].reverse().filter((id) => layersById[id]?.visible === true);
}

/** The active variable id for `layerId`, or `undefined` if the layer isn't tracked. Resolving
 * this to the full config-defined variable (label, legend, renderer) is the config helpers'
 * job (`getVariable`), not a selector's — state only ever holds the id. */
export function selectActiveVariable(stores: AppStores, layerId: string): string | undefined {
  return stores.layers.get("variableByLayerId")[layerId];
}

export interface ShareState {
  visibleIds: string[];
  expandedIds: string[];
  expandedLegendIds: string[];
  variableByLayerId: Record<string, string>;
  tableLayerId: string | null;
  tablePage: number;
  center: [number, number];
  zoom: number;
}

/** Everything the share link needs, read synchronously — see Task 25/share-app: subscribeMany
 * is a microtask, so a click handler must read state directly rather than trust subscribers. */
export function selectShareState(stores: AppStores): ShareState {
  return {
    visibleIds: selectVisibleIds(stores),
    expandedIds: stores.ui.get("expandedIds"),
    expandedLegendIds: stores.ui.get("expandedLegendIds"),
    variableByLayerId: stores.layers.get("variableByLayerId"),
    tableLayerId: stores.ui.get("tableLayerId"),
    tablePage: stores.ui.get("tablePage"),
    center: stores.viewport.get("center"),
    zoom: stores.viewport.get("zoom"),
  };
}
