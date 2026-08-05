import type OLMap from "ol/Map.js";
import type OLBaseLayer from "ol/layer/Base.js";
import type OLVectorLayer from "ol/layer/Vector.js";
import type { StyleLike } from "ol/style/Style.js";
import type { Subscription } from "@mini/lib/core";
import { createNativeLayer, toOLStyle } from "@mini/lib/maps";
import type { LayerConfig } from "../config/types.ts";
import { getVariable } from "../config/index.ts";
import type { AppStores } from "../state/facade.ts";
import { selectOrderedVisibleIds } from "../state/selectors.ts";

/** The minimal surface reconcileVisibility needs from an OL layer — kept narrow so tests can
 * exercise it against a fake layer instead of a real OL instance. */
export interface ReconcilableLayer {
  getVisible: () => boolean;
  setVisible: (visible: boolean) => void;
  setZIndex: (zIndex: number) => void;
}

export type LayerRegistry = Map<string, ReconcilableLayer>;

/**
 * Builds every configured layer via the lib's layer factory (do not reimplement layer
 * construction), applies its active variable's style, registers it, and adds it to the map.
 * Layers stay attached for the app's lifetime — visibility is reconciled separately, because
 * the table queries a layer's data whether or not it's currently shown. Never enters any store.
 */
export function buildRegistry(map: OLMap, configs: LayerConfig[], stores: AppStores): LayerRegistry {
  const variableByLayerId = stores.layers.get("variableByLayerId");
  const registry: LayerRegistry = new Map();

  for (const config of configs) {
    const native = createNativeLayer(config);
    applyInitialStyle(native, config, variableByLayerId[config.id]);
    registry.set(config.id, native);
    map.addLayer(native);
  }

  return registry;
}

function applyInitialStyle(native: OLBaseLayer, config: LayerConfig, variableId: string | undefined): void {
  if (variableId === undefined) return;
  const variable = getVariable(config, variableId);
  if (!variable) return;
  (native as OLVectorLayer).setStyle(toOLStyle(variable.renderer) as unknown as StyleLike);
}

/**
 * Applies `visibleIds` (already in the desired reversed-`layerOrder` z-order) to the registry,
 * touching only layers whose visible state actually changes. zIndex is reassigned for every
 * currently-visible layer on every call — cheap and idempotent, unlike `setVisible`, so it isn't
 * subject to the same diff-only requirement.
 */
export function reconcileVisibility(registry: LayerRegistry, visibleIds: string[]): void {
  const visibleSet = new Set(visibleIds);
  for (const [id, layer] of registry) {
    const shouldBeVisible = visibleSet.has(id);
    if (layer.getVisible() !== shouldBeVisible) layer.setVisible(shouldBeVisible);
  }
  visibleIds.forEach((id, index) => {
    registry.get(id)?.setZIndex(visibleIds.length - 1 - index);
  });
}

export interface Reconciler {
  reconcileCallCount: () => number;
  destroy: () => void;
}

/**
 * Wires `reconcileVisibility` to `layersById`/`layerOrder` changes — `immediate` covers state
 * already populated at wire-up, the subscription covers later changes, one mechanism for both.
 * The call counter (asserted against in Task 18 and Task 27) proves a batched write triggers
 * exactly one reconcile, not one per key.
 */
export function createReconciler(registry: LayerRegistry, stores: AppStores): Reconciler {
  let callCount = 0;
  const reconcile = (): void => {
    callCount++;
    reconcileVisibility(registry, selectOrderedVisibleIds(stores));
  };
  const subscription: Subscription = stores.layers.subscribeMany(["layersById", "layerOrder"], reconcile, {
    immediate: true,
  });

  return {
    reconcileCallCount: () => callCount,
    destroy: () => {
      subscription.remove();
    },
  };
}
