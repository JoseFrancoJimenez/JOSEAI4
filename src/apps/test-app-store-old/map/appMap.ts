import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import type { FeatureLike } from 'ol/Feature.js';
import type OLVectorLayer from 'ol/layer/Vector.js';
import type { StyleLike } from 'ol/style/Style.js';
import Evented from '../../lib/core/evented.ts';
import type { Subscription } from '../../lib/core/evented.ts';
import { createMap, toOLStyle, type OLMap, type OLBaseLayer } from '../../lib/maps/map/openLayers/openLayers.ts';
import type { AppLayer } from '../../lib/maps/layers/baseLayer.ts';
import { VectorAppLayer } from '../../lib/maps/layers/vectorLayer.ts';
import type { LayersState, MapState } from '../state/index.ts';

/** Typed event map for {@link AppMap}. */
export interface AppMapEvents {
  /** Fired after an OL layer is added to the map. */
  'layer:added':   { id: string; layer: OLBaseLayer };
  /** Fired after an OL layer is removed from the map. */
  'layer:removed': { id: string; layer: OLBaseLayer };
}

/** One entry in the array returned by {@link AppMap.hitTest}. */
export interface HitTestResult {
  /** Id of the layer that owns the hit features. */
  id: string;
  /** The OL layer that owns the hit features. */
  layer: OLBaseLayer;
  /** Features found at the queried pixel, in render order. */
  features: FeatureLike[];
}

interface LayerEntry {
  layer: OLBaseLayer;
  subscriptions: Subscription[];
}

/**
 * Manages the OpenLayers map instance and the OL layers on it. It is driven by
 * the app stores it receives: {@link MapState} for the view (center/zoom/extent,
 * kept in sync both ways) and {@link LayersState} for layer state — when an OL
 * layer is added, AppMap looks up its state by id and wires them together
 * (visibility, opacity, and — for vector layers — the active variable's style).
 */
class AppMap extends Evented<AppMapEvents> {
  static readonly #OWN_EVENTS = new Set<string>(['layer:added', 'layer:removed']);

  readonly #nativeMap: OLMap;
  readonly #layersState: LayersState;
  readonly #mapState: MapState;
  readonly #layers = new Map<string, LayerEntry>();
  #baseLayer: OLBaseLayer;
  #syncingFromView = false;

  /**
   * @param target - DOM element (or element id) to render the map into.
   * @param mapState - View state; the initial view is built from it and kept in sync.
   * @param layersState - Layer state; each added OL layer is wired to its entry here.
   */
  constructor(target: string | HTMLElement, mapState: MapState, layersState: LayersState) {
    super();
    this.#mapState = mapState;
    this.#layersState = layersState;
    this.#nativeMap = createMap({ target, center: mapState.center, zoom: mapState.zoom });
    this.#baseLayer = new TileLayer({ source: new OSM(), zIndex: 0 });
    this.#nativeMap.addLayer(this.#baseLayer);
    this.#bindMapState();
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
   * Adds an already-constructed OL layer to the map, registered under its own `id`
   * property, looks up its state in {@link LayersState}, wires the two together, and
   * emits `layer:added`.
   * @throws {Error} If the layer has no `id`, one with the same id is already on the map, or no state is registered for it.
   */
  addLayer(layer: OLBaseLayer): void {
    const id = layer.get('id') as string | undefined;
    if (id === undefined) {
      throw new Error('Layer must carry an "id" property before being added to the map.');
    }
    if (this.#layers.has(id)) {
      throw new Error(`Layer "${id}" is already on the map.`);
    }
    const state = this.#layersState.getLayer(id);
    if (!state) {
      throw new Error(`No layer state registered in LayersState for "${id}".`);
    }

    const subscriptions = this.#wire(state, layer);
    this.#nativeMap.addLayer(layer);
    this.#layers.set(id, { layer, subscriptions });
    this.emit('layer:added', { id, layer });
  }

  /** Removes a layer by ID, tears down its state wiring, and emits `layer:removed`. No-op if the ID is not found. */
  removeLayer(id: string): void {
    const entry = this.#layers.get(id);
    if (!entry) return;
    entry.subscriptions.forEach(s => s.remove());
    this.#nativeMap.removeLayer(entry.layer);
    this.#layers.delete(id);
    this.emit('layer:removed', { id, layer: entry.layer });
  }

  /** Returns the OL layer registered under `id`, or `undefined` if not found. */
  getLayer(id: string): OLBaseLayer | undefined {
    return this.#layers.get(id)?.layer;
  }

  /** Returns all registered OL layers in insertion order. */
  getLayers(): OLBaseLayer[] {
    return [...this.#layers.values()].map(e => e.layer);
  }

  /** Returns all features at the given screen pixel, grouped by their layer id. */
  hitTest(pixel: [number, number]): HitTestResult[] {
    const results: HitTestResult[] = [];

    this.#nativeMap.forEachFeatureAtPixel(pixel, (feature, layer) => {
      if (!layer) return;
      const id = layer.get('id') as string | undefined;
      if (id === undefined || !this.#layers.has(id)) return;
      let result = results.find(r => r.id === id);
      if (!result) { result = { id, layer: layer as OLBaseLayer, features: [] }; results.push(result); }
      result.features.push(feature as FeatureLike);
    });

    return results;
  }

  /**
   * Wires an {@link AppLayer} (state) to its OL layer: applies the current state,
   * then keeps the OL layer in sync as the state changes. Returns the subscriptions
   * so {@link removeLayer} can tear them down.
   */
  #wire(state: AppLayer, layer: OLBaseLayer): Subscription[] {
    layer.setVisible(state.visible);
    layer.setOpacity(state.opacity);

    const subscriptions: Subscription[] = [
      state.on('change:visible', ({ visible }) => layer.setVisible(visible)),
      state.on('change:opacity', ({ opacity }) => layer.setOpacity(opacity)),
    ];

    if (state instanceof VectorAppLayer) {
      const vector = layer as OLVectorLayer;
      if (state.variable) {
        vector.setStyle(toOLStyle(state.variable.renderer) as unknown as StyleLike);
      }
      subscriptions.push(
        state.on('change:variable', ({ variable }) =>
          vector.setStyle(toOLStyle(variable.renderer) as unknown as StyleLike)
        )
      );
    }

    return subscriptions;
  }

  /** Keeps {@link MapState} and the OL view in sync both ways, guarding against feedback loops. */
  #bindMapState(): void {
    const view = this.#nativeMap.getView();

    // view → state: mirror the view onto the store after every move.
    this.#nativeMap.on('moveend', () => {
      this.#syncingFromView = true;
      const center = view.getCenter();
      const zoom = view.getZoom();
      const size = this.#nativeMap.getSize();
      if (center) this.#mapState.center = [center[0], center[1]];
      if (zoom !== undefined) this.#mapState.zoom = zoom;
      if (size) this.#mapState.extent = view.calculateExtent(size);
      this.#syncingFromView = false;
    });

    // state → view: drive the view when the store changes from anywhere but our own
    // moveend mirror above. Setting `extent` fits the view to it.
    this.#mapState.on('change:center', ({ center }) => {
      if (!this.#syncingFromView) view.setCenter(center);
    });
    this.#mapState.on('change:zoom', ({ zoom }) => {
      if (!this.#syncingFromView) view.setZoom(zoom);
    });
    this.#mapState.on('change:extent', ({ extent }) => {
      if (!this.#syncingFromView && extent) view.fit(extent);
    });
  }
}

export { AppMap };
