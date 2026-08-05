import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import { createMap, toOLStyle, type OLMap } from "@mini/lib/maps";
import type { LayerConfig } from "../config/types.ts";
import { getVariable } from "../config/index.ts";
import type { AppStores } from "../state/facade.ts";
import { buildRegistry, createReconciler, type LayerRegistry } from "./registry.ts";

export interface MapController {
  map: OLMap;
  registry: LayerRegistry;
  reconcileCallCount: () => number;
  destroy: () => void;
}

interface Stylable {
  setStyle: (style: unknown) => void;
}

/**
 * Restyles, in place, every layer whose active variable actually changed between two
 * `variableByLayerId` records — an unrelated change to the record touches nothing, so this never
 * rebuilds or re-adds a layer, and never refetches its source. An unknown variable id (e.g. a
 * stale share link) is ignored with a warning rather than throwing. `ReconcilableLayer` only
 * declares the visibility surface, so the real OL layer's `setStyle` is reached the same way
 * `registry.ts` reaches it for the initial style: a narrow cast to the method actually needed.
 */
export function restyleChangedVariables(
  registry: LayerRegistry,
  configs: LayerConfig[],
  previous: Record<string, string>,
  next: Record<string, string>,
): void {
  for (const config of configs) {
    const variableId = next[config.id];
    if (variableId === undefined || variableId === previous[config.id]) continue;

    const variable = getVariable(config, variableId);
    if (!variable) {
      console.warn(`restyle: unknown variable "${variableId}" for layer "${config.id}"`);
      continue;
    }

    const layer = registry.get(config.id) as unknown as Stylable | undefined;
    layer?.setStyle(toOLStyle(variable.renderer));
  }
}

/**
 * Constructs the OL map with a single basemap and an initial view centered on Canada (the demo
 * data's extent), builds every configured layer, and wires visibility reconciliation and
 * variable restyling to the layers store. The map instance and registry are owned solely by this
 * module and must never enter any store.
 */
export function createMapController(target: string | HTMLElement, configs: LayerConfig[], stores: AppStores): MapController {
  const map = createMap({ target, center: [-96, 62], zoom: 4 });
  map.addLayer(new TileLayer({ source: new OSM() }));

  const registry = buildRegistry(map, configs, stores);
  const reconciler = createReconciler(registry, stores);
  const restyleSubscription = stores.layers.subscribe("variableByLayerId", (value, previous) => {
    restyleChangedVariables(registry, configs, previous, value);
  });

  return {
    map,
    registry,
    reconcileCallCount: reconciler.reconcileCallCount,
    destroy: () => {
      reconciler.destroy();
      restyleSubscription.remove();
      map.setTarget(undefined);
    },
  };
}
