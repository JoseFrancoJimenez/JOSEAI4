import './map-widget.css';
import type { Extent } from 'ol/extent.js';
import { AppMap } from '../../map/appMap.ts';
import { createAppLayers } from '../../map/layerFactory.ts';
import type { LayersState, MapState } from '../../state/index.ts';

/**
 * Hosts the OpenLayers map. Wraps {@link AppMap}: the map renders into this
 * element, driven by the view store ({@link MapState}) and layer store
 * ({@link LayersState}), with the app's OL layers added to it. Optionally frames a
 * starting extent on first render (the default Canada framing, skipped when a
 * share link restores a view).
 *
 * Call {@link setup} before connecting; read {@link map} once connected to wire
 * map-dependent widgets (e.g. the popup) to the underlying {@link AppMap}.
 */
class MapWidget extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'map-widget';

  #map: AppMap | null = null;
  #mapState: MapState | null = null;
  #layersState: LayersState | null = null;
  #frameExtent: Extent | undefined;

  /**
   * Binds the widget to its stores and optional initial framing. May be called
   * before or after the element is connected.
   * @param mapState - View state the map is built from and kept in sync with.
   * @param layersState - Layer state each added OL layer is wired to.
   * @param frameExtent - Extent to fit on first render, or undefined to leave the view as-is.
   */
  setup(mapState: MapState, layersState: LayersState, frameExtent?: Extent): void {
    this.#mapState = mapState;
    this.#layersState = layersState;
    this.#frameExtent = frameExtent;
    if (this.isConnected) this.#build();
  }

  /** Called by the browser when the element is inserted into the DOM. */
  connectedCallback(): void {
    this.#build();
  }

  /** The underlying map. Throws if read before the widget has been set up and connected. */
  get map(): AppMap {
    if (!this.#map) throw new Error('MapWidget: read `map` only after setup() and connection.');
    return this.#map;
  }

  /** Creates the AppMap targeting this element, adds the app layers, and frames the initial extent. */
  #build(): void {
    if (!this.#mapState || !this.#layersState || this.#map) return;

    const map = new AppMap(this, this.#mapState, this.#layersState);

    // OL layers from the app factory, stacked bottom-to-top: provinces (polygons) →
    // sample points → airports. Each carries its id so AppMap wires it to its state.
    for (const layer of createAppLayers()) map.addLayer(layer);

    // Frame the initial extent once the element has its laid-out size.
    if (this.#frameExtent) {
      const extent = this.#frameExtent;
      map.once('postrender', () => { this.#mapState!.extent = extent; });
    }

    this.#map = map;
  }
}

if (!customElements.get(MapWidget.tagName)) {
  customElements.define(MapWidget.tagName, MapWidget);
}

export { MapWidget };
