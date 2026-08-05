import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import { createMap, type OLMap } from "@mini/lib/maps";

export interface MapController {
  map: OLMap;
  destroy: () => void;
}

/**
 * Constructs the OL map with a single basemap and an initial view centered on Canada (the demo
 * data's extent). The map instance is owned solely by this module and must never enter any
 * store.
 */
export function createMapController(target: string | HTMLElement): MapController {
  const map = createMap({ target, center: [-96, 62], zoom: 4 });
  map.addLayer(new TileLayer({ source: new OSM() }));

  return {
    map,
    destroy: () => {
      map.setTarget(undefined);
    },
  };
}
