import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import { createMap, type OLMap } from "@mini/lib/maps";
import type { LayerConfig } from "../config/types.ts";
import type { AppStores } from "../state/facade.ts";
import { buildRegistry, createReconciler, type LayerRegistry } from "./registry.ts";

export interface MapController {
  map: OLMap;
  registry: LayerRegistry;
  reconcileCallCount: () => number;
  destroy: () => void;
}

/**
 * Constructs the OL map with a single basemap and an initial view centered on Canada (the demo
 * data's extent), builds every configured layer, and wires visibility reconciliation to the
 * layers store. The map instance and registry are owned solely by this module and must never
 * enter any store.
 */
export function createMapController(target: string | HTMLElement, configs: LayerConfig[], stores: AppStores): MapController {
  const map = createMap({ target, center: [-96, 62], zoom: 4 });
  map.addLayer(new TileLayer({ source: new OSM() }));

  const registry = buildRegistry(map, configs, stores);
  const reconciler = createReconciler(registry, stores);

  return {
    map,
    registry,
    reconcileCallCount: reconciler.reconcileCallCount,
    destroy: () => {
      reconciler.destroy();
      map.setTarget(undefined);
    },
  };
}
