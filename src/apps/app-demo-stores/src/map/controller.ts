import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
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

/** The narrow view/map surface `wireViewport` needs — kept minimal so tests can drive it with a
 * fake instead of a real OL `Map`/`View`. `center` is always lon/lat (EPSG:4326), matching the
 * store and the share-link format; conversion to/from the view's own projection happens only at
 * this boundary. */
export interface ViewportView {
  getCenter: () => number[] | undefined;
  getZoom: () => number | undefined;
  setCenter: (center: number[]) => void;
  setZoom: (zoom: number) => void;
}

export interface ViewportMap {
  getView: () => ViewportView;
  on: (type: "moveend", listener: () => void) => void;
  un: (type: "moveend", listener: () => void) => void;
}

// Sub-tolerance drift (float round-trip through the view's projection, sub-pixel pans) is
// treated as no change in either direction — without this the two directions ping-pong forever.
const CENTER_EPSILON_DEG = 1e-4;
const ZOOM_EPSILON = 1e-3;

function withinTolerance(a: [number, number], aZoom: number, b: [number, number], bZoom: number): boolean {
  return (
    Math.abs(a[0] - b[0]) < CENTER_EPSILON_DEG &&
    Math.abs(a[1] - b[1]) < CENTER_EPSILON_DEG &&
    Math.abs(aZoom - bZoom) < ZOOM_EPSILON
  );
}

/**
 * Two-way syncs the map's view with `stores.viewport`, guarded against feedback in both
 * directions: an `applyingFromStore` flag suppresses the `moveend` handler while a store-driven
 * apply is in flight, and a numeric tolerance absorbs float drift on both sides so neither
 * direction re-writes a value that has already settled.
 */
export function wireViewport(map: ViewportMap, stores: AppStores): { destroy: () => void } {
  const view = map.getView();
  let applyingFromStore = false;

  const applyFromStore = (): void => {
    const center = stores.viewport.get("center");
    const zoom = stores.viewport.get("zoom");
    const currentRaw = view.getCenter();
    const currentCenter = currentRaw ? (toLonLat(currentRaw) as [number, number]) : center;
    const currentZoom = view.getZoom() ?? zoom;
    if (withinTolerance(currentCenter, currentZoom, center, zoom)) return;

    applyingFromStore = true;
    view.setCenter(fromLonLat(center));
    view.setZoom(zoom);
    applyingFromStore = false;
  };

  const onMoveEnd = (): void => {
    if (applyingFromStore) return;
    const centerRaw = view.getCenter();
    const zoom = view.getZoom();
    if (!centerRaw || zoom === undefined) return;
    const center = toLonLat(centerRaw) as [number, number];

    const prevCenter = stores.viewport.get("center");
    const prevZoom = stores.viewport.get("zoom");
    if (withinTolerance(prevCenter, prevZoom, center, zoom)) return;

    stores.viewport.setView({ center, zoom });
  };

  const centerSub = stores.viewport.subscribe("center", applyFromStore);
  const zoomSub = stores.viewport.subscribe("zoom", applyFromStore);
  map.on("moveend", onMoveEnd);

  return {
    destroy: () => {
      centerSub.remove();
      zoomSub.remove();
      map.un("moveend", onMoveEnd);
    },
  };
}

/**
 * Constructs the OL map with a single basemap and an initial view seeded from the viewport
 * store (so a restored share link takes effect before the map ever renders), builds every
 * configured layer, and wires visibility reconciliation, variable restyling, and two-way
 * viewport sync to the store. The map instance and registry are owned solely by this module and
 * must never enter any store.
 */
export function createMapController(target: string | HTMLElement, configs: LayerConfig[], stores: AppStores): MapController {
  const map = createMap({ target, center: stores.viewport.get("center"), zoom: stores.viewport.get("zoom") });
  map.addLayer(new TileLayer({ source: new OSM() }));

  const registry = buildRegistry(map, configs, stores);
  const reconciler = createReconciler(registry, stores);
  const restyleSubscription = stores.layers.subscribe("variableByLayerId", (value, previous) => {
    restyleChangedVariables(registry, configs, previous, value);
  });
  const viewport = wireViewport(map as unknown as ViewportMap, stores);

  return {
    map,
    registry,
    reconcileCallCount: reconciler.reconcileCallCount,
    destroy: () => {
      reconciler.destroy();
      restyleSubscription.remove();
      viewport.destroy();
      map.setTarget(undefined);
    },
  };
}
