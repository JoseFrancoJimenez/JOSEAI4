import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { unByKey } from 'ol/Observable.js';
import { fromLonLat, toLonLat as olToLonLat, transformExtent } from 'ol/proj.js';
import GeoJSONFormat from 'ol/format/GeoJSON.js';
import type { EventsKey } from 'ol/events.js';
import type OLVectorLayer from 'ol/layer/Vector.js';
import type { SimpleGeometry } from 'ol/geom.js';
import type { StyleLike } from 'ol/style/Style.js';
import type { FeatureLike } from 'ol/Feature.js';
import type { Geometry } from 'geojson';
import Evented from '../../../components/evented.ts';
import type { Subscription } from '../../../components/evented.ts';
import { createMap, toOLStyle, type MapConfig, type OLMap, type OLBaseLayer } from '../maps/openLayers/openLayers.ts';
import { createNativeLayer } from '../maps/openLayers/layerFactory.ts';
import type { AppLayer } from '../layers/baseLayer.ts';
import { VectorAppLayer } from '../layers/vectorLayer.ts';
import type { LayerConfig } from '../layers/types.ts';
import type { GisStore } from '../state/gisStore.ts';
import type { LayerRuntimeState } from '../state/layers.slice.ts';
import type { ViewState } from '../state/view.slice.ts';
import { selectLayerState, selectView } from '../state/selectors.ts';
import { createOverlay, type OverlayHandle } from '../maps/openLayers/overlay.ts';
import { startPolygonDraw, type DrawSession } from './draw.ts';

/** `[minLon, minLat, maxLon, maxLat]` in EPSG:4326. */
export type Extent4326 = [number, number, number, number];

/** Typed event map for {@link AppMap}. */
export interface AppMapEvents {
  /** Fired after a layer is registered and added to the OL map. */
  'layer:added':   { layer: AppLayer };
  /** Fired after a layer is removed from the OL map and its subscriptions cleaned up. */
  'layer:removed': { layer: AppLayer };
}

/** One entry in the array returned by {@link AppMap.hitTest}. */
export interface HitTestResult {
  /** The app layer that owns the hit features. */
  layer: AppLayer;
  /** Features found at the queried pixel, in render order. */
  features: FeatureLike[];
}

interface LayerEntry {
  layer: AppLayer;
  native: OLBaseLayer;
}

/** Manages the OpenLayers map instance, its AppLayer registry, and emits layer lifecycle events. */
class AppMap extends Evented<AppMapEvents> {
  static readonly #OWN_EVENTS = new Set<string>(['layer:added', 'layer:removed']);

  readonly #nativeMap: OLMap;
  readonly #store: GisStore;
  readonly #layers = new Map<string, LayerEntry>();
  readonly #unbind: () => void;
  #baseLayer: OLBaseLayer;
  #drawSession: DrawSession | null = null;

  constructor(config: MapConfig, store: GisStore) {
    super();
    this.#nativeMap = createMap(config);
    this.#store = store;
    this.#baseLayer = new TileLayer({ source: new OSM(), zIndex: 0 });
    this.#nativeMap.addLayer(this.#baseLayer);

    // The binder (ADR-3): the one place store state reaches the native map —
    // layer records and the view — in a single subscription. Slice records
    // keep identity when untouched, so a reference diff pinpoints what changed.
    let lastById = store.getState().layers.byId;
    let lastView = store.getState().view;
    this.#unbind = store.subscribe(() => {
      const state = store.getState();
      if (state.layers.byId !== lastById) {
        for (const [id, entry] of this.#layers) {
          const record = state.layers.byId[id];
          if (record && record !== lastById[id]) this.#applyState(entry, record);
        }
        lastById = state.layers.byId;
      }
      if (state.view !== lastView) {
        lastView = state.view;
        this.#applyView(selectView(state));
      }
    });
  }

  /** Releases the binder subscription. Call when discarding the map instance. */
  dispose(): void {
    this.#unbind();
  }

  /** The underlying OL map instance. Use for OL-specific operations (overlays, view access, etc.). */
  get nativeMap(): OLMap { return this.#nativeMap; }

  /**
   * Subscribe to an AppMap event or any native OL map event through a single API.
   * Own events (`layer:added`, `layer:removed`) are typed; all other strings are forwarded to OL.
   */
  on<K extends keyof AppMapEvents & string>(event: K, handler: (payload: AppMapEvents[K]) => void): Subscription;
  on(event: string, handler: (payload: any) => void): Subscription;
  on(event: string, handler: (payload: any) => void): Subscription {
    if (AppMap.#OWN_EVENTS.has(event)) return super.on(event as keyof AppMapEvents & string, handler);
    const key = this.#nativeMap.on(event as any, handler) as EventsKey;
    return { remove: () => unByKey(key) };
  }

  /**
   * Subscribe to an event exactly once. Own events are typed; all other strings are forwarded to OL.
   * Cancel before the event fires by calling `Subscription.remove()` on the returned value.
   */
  once<K extends keyof AppMapEvents & string>(event: K, handler: (payload: AppMapEvents[K]) => void): Subscription;
  once(event: string, handler: (payload: any) => void): Subscription;
  once(event: string, handler: (payload: any) => void): Subscription {
    if (AppMap.#OWN_EVENTS.has(event)) return super.once(event as keyof AppMapEvents & string, handler);
    const key = this.#nativeMap.once(event as any, handler) as EventsKey;
    return { remove: () => unByKey(key) };
  }

  /** Replaces the base tile layer rendered at z-index 0 (e.g. swap OSM for a custom basemap). */
  setBaseLayer(layer: OLBaseLayer): void {
    this.#nativeMap.removeLayer(this.#baseLayer);
    this.#baseLayer = layer;
    this.#nativeMap.getLayers().insertAt(0, layer);
  }

  /**
   * Pairs an externally-created {@link AppLayer} with a native OL layer built
   * from its config, applies its current runtime state, and emits
   * `layer:added`. The AppLayer registered its state on construction, so
   * state set before adding (or surviving a previous removal) is honored.
   * @throws {Error} If a layer with the same id is already on the map.
   */
  addLayer(layer: AppLayer<LayerConfig>): void {
    if (this.#layers.has(layer.id)) {
      throw new Error(`Layer "${layer.id}" is already on the map.`);
    }

    const native = createNativeLayer(layer.config);
    const entry: LayerEntry = { layer, native };

    const record = selectLayerState(this.#store.getState(), layer.id);
    if (record) this.#applyState(entry, record);

    this.#nativeMap.addLayer(native);
    this.#layers.set(layer.id, entry);
    this.emit('layer:added', { layer });
  }

  /**
   * Removes a layer by ID from the map and emits `layer:removed`. The layer's
   * runtime state intentionally survives — AppLayers outlive map membership;
   * dispatch `layerUnregistered` when a layer is discarded for good. No-op if
   * the ID is not found.
   */
  removeLayer(id: string): void {
    const entry = this.#layers.get(id);
    if (!entry) return;
    this.#nativeMap.removeLayer(entry.native);
    this.#layers.delete(id);
    this.emit('layer:removed', { layer: entry.layer });
  }

  /** Applies a store record to the native layer. The only writer of native visibility/opacity/style (ground rule 4). */
  #applyState(entry: LayerEntry, state: LayerRuntimeState): void {
    entry.native.setVisible(state.visible);
    entry.native.setOpacity(state.opacity);
    if (entry.layer instanceof VectorAppLayer && state.variableId !== undefined) {
      const renderer = entry.layer.resolveVariable(state.variableId).renderer;
      (entry.native as OLVectorLayer).setStyle(toOLStyle(renderer) as unknown as StyleLike);
    }
  }

  /** Returns the AppLayer registered under `id`, or `undefined` if not found. */
  getLayer(id: string): AppLayer | undefined {
    return this.#layers.get(id)?.layer;
  }

  /** Returns all registered AppLayers in insertion order. */
  getLayers(): AppLayer[] {
    return [...this.#layers.values()].map(e => e.layer);
  }

  /** Returns the raw OL layer paired with `id`, or `undefined` if not found. Use for OL-specific operations not exposed by AppLayer. */
  getNativeLayer(id: string): OLBaseLayer | undefined {
    return this.#layers.get(id)?.native;
  }

  /** Fits the view to a 4326 GeoJSON geometry or a 4326 extent. */
  fit(geometry: Geometry | Extent4326, opts?: { padding?: number[]; maxZoom?: number }): void {
    const view = this.#nativeMap.getView();
    const fitOptions = { padding: opts?.padding, maxZoom: opts?.maxZoom };
    if (Array.isArray(geometry)) {
      view.fit(transformExtent(geometry, 'EPSG:4326', view.getProjection()), fitOptions);
      return;
    }
    const format = new GeoJSONFormat({
      dataProjection: 'EPSG:4326',
      featureProjection: view.getProjection(),
    });
    view.fit(format.readGeometry(geometry) as SimpleGeometry, fitOptions);
  }

  /** Anchors `element` to the map. Positions are lon/lat; `null` hides (see {@link OverlayHandle}). */
  createOverlay(element: HTMLElement, opts?: { offset?: [number, number] }): OverlayHandle {
    return createOverlay(this.#nativeMap, element, opts);
  }

  /**
   * Starts a polygon draw session (resolves 4326 GeoJSON, `null` on cancel).
   * Only one session at a time: starting a second cancels the first.
   */
  startPolygonDraw(): DrawSession {
    this.#drawSession?.cancel();
    const session = startPolygonDraw(this.#nativeMap);
    this.#drawSession = session;
    void session.finished.then(() => {
      if (this.#drawSession === session) this.#drawSession = null;
    });
    return session;
  }

  /**
   * Current view center (lon/lat, EPSG:4326) and zoom — the shareable part of
   * the view. Rounded (~1 m / hundredth of a zoom level) to keep permalinks short.
   */
  getViewState(): ViewState {
    const view = this.#nativeMap.getView();
    const center = olToLonLat(view.getCenter() ?? [0, 0], view.getProjection());
    return {
      center: [Number(center[0]!.toFixed(5)), Number(center[1]!.toFixed(5))],
      zoom: Math.round((view.getZoom() ?? 0) * 100) / 100,
    };
  }

  /**
   * Applies a store view onto the native view (store → map). Skips when the
   * live view already matches (rounded), which breaks the sync loop: a
   * programmatic move fires `moveend`, whose dispatched `viewChanged` carries
   * the value we just set, so re-entering here is a no-op.
   */
  #applyView(next: ViewState): void {
    const current = this.getViewState();
    if (current.center[0] === next.center[0] &&
        current.center[1] === next.center[1] &&
        current.zoom === next.zoom) {
      return;
    }
    const view = this.#nativeMap.getView();
    view.setCenter(fromLonLat(next.center, view.getProjection()));
    view.setZoom(next.zoom);
  }

  /** Converts a screen pixel to lon/lat (e.g. the popup anchor for a click). */
  toLonLat(pixel: [number, number]): [number, number] {
    const coordinate = this.#nativeMap.getCoordinateFromPixel(pixel);
    const view = this.#nativeMap.getView();
    return olToLonLat(coordinate, view.getProjection()) as [number, number];
  }

  /** Returns all features at the given screen pixel, grouped by their AppLayer. */
  hitTest(pixel: [number, number]): HitTestResult[] {
    const results: HitTestResult[] = [];
    const nativeToApp = new Map<OLBaseLayer, AppLayer>();
    for (const entry of this.#layers.values()) nativeToApp.set(entry.native, entry.layer);

    this.#nativeMap.forEachFeatureAtPixel(pixel, (feature, layer) => {
      if (!layer) return;
      const appLayer = nativeToApp.get(layer as OLBaseLayer);
      if (!appLayer) return;
      let result = results.find(r => r.layer === appLayer);
      if (!result) { result = { layer: appLayer, features: [] }; results.push(result); }
      result.features.push(feature as FeatureLike);
    });

    return results;
  }
}

export { AppMap };
