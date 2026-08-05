import type { StoreLike } from "./facade.ts";
import type { LayerState, LayersSlice, UiSlice, ViewportSlice } from "./keys.ts";

/**
 * Plain action functions shared between the domain stores (Task 10) and the single AppStore
 * (Task 11) — both wire the exact same logic against a StoreLike, so the two wirings are
 * provably equivalent instead of hand-kept in sync.
 */

export function setVisible(store: StoreLike<LayersSlice>, id: string, visible: boolean): void {
  const current = store.get("layersById");
  const layer = current[id];
  if (!layer || layer.visible === visible) return;
  store.set("layersById", { ...current, [id]: { ...layer, visible } });
}

export function toggleVisible(store: StoreLike<LayersSlice>, id: string): void {
  const layer = store.get("layersById")[id];
  if (!layer) return;
  setVisible(store, id, !layer.visible);
}

/** Cascade path: flips N layers and emits `layersById` exactly once. */
export function setVisibleMany(store: StoreLike<LayersSlice>, ids: string[], visible: boolean): void {
  const current = store.get("layersById");
  let changed = false;
  const next: Record<string, LayerState> = { ...current };
  for (const id of ids) {
    const layer = current[id];
    if (layer && layer.visible !== visible) {
      next[id] = { ...layer, visible };
      changed = true;
    }
  }
  if (changed) store.set("layersById", next);
}

export function setVariable(store: StoreLike<LayersSlice>, id: string, variableId: string): void {
  const current = store.get("variableByLayerId");
  if (current[id] === variableId) return;
  store.set("variableByLayerId", { ...current, [id]: variableId });
}

/** Expansion echo-guarding (compare contents before writing) is the widget's job, not the
 * store's — a freshly built array here is expected to always be a new reference. */
export function setExpanded(store: StoreLike<UiSlice>, ids: string[]): void {
  store.set("expandedIds", [...ids]);
}

export function setLegendExpanded(store: StoreLike<UiSlice>, ids: string[]): void {
  store.set("expandedLegendIds", [...ids]);
}

export function setTableLayer(store: StoreLike<UiSlice>, id: string | null): void {
  store.set("tableLayerId", id);
}

export function setPage(store: StoreLike<UiSlice>, n: number): void {
  store.set("tablePage", n);
}

export function setView(
  store: StoreLike<ViewportSlice>,
  next: { center: [number, number]; zoom: number },
): void {
  store.batch(() => {
    store.set("center", next.center);
    store.set("zoom", next.zoom);
  });
}
