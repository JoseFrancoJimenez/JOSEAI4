import Evented from '../../lib/core/evented.ts';
import type { Extent } from 'ol/extent.js';

/**
 * How the map responds to pointer input. `'popup'` (the default) lets clicks open
 * feature popups; the drawing modes hand clicks to the draw tool instead. The
 * modes are mutually exclusive, so the popup and the draw tool never both react to
 * the same click.
 */
export type MapMode = 'popup' | 'draw-circle' | 'draw-rectangle';

/** Event map for {@link MapState}. */
export interface IMapStateEvents {
  'change:center': { center: [number, number] };
  'change:zoom': { zoom: number };
  'change:extent': { extent: Extent | undefined };
  'change:mode': { mode: MapMode };
}

/** Construction values for a {@link MapState}. */
export interface MapStateInit {
  center: [number, number];
  zoom: number;
  extent?: Extent;
  mode?: MapMode;
}

/**
 * The map's view state: `center`, `zoom`, and the visible `extent`, plus the active
 * pointer `mode` (popup vs a drawing tool). The view is kept in sync with the
 * OpenLayers view both ways by {@link AppMap} — the map writes back on `moveend`,
 * and setting a property here drives the view (setting `extent` fits the view to
 * it). `mode` is the single switch the popup and the draw widget share so only one
 * of them reacts to a click. Setters only fire when the value actually changes, so
 * the two-way sync doesn't loop. Extends {@link Evented}.
 */
export class MapState extends Evented<IMapStateEvents> {
  #center: [number, number];
  #zoom: number;
  #extent: Extent | undefined;
  #mode: MapMode;

  constructor(init: MapStateInit) {
    super();
    this.#center = init.center;
    this.#zoom = init.zoom;
    this.#extent = init.extent;
    this.#mode = init.mode ?? 'popup';
  }

  get center(): [number, number] { return this.#center; }
  set center(value: [number, number]) {
    if (this.#center[0] === value[0] && this.#center[1] === value[1]) return;
    this.#center = value;
    this.emit('change:center', { center: value });
  }

  get zoom(): number { return this.#zoom; }
  set zoom(value: number) {
    if (this.#zoom === value) return;
    this.#zoom = value;
    this.emit('change:zoom', { zoom: value });
  }

  get extent(): Extent | undefined { return this.#extent; }
  set extent(value: Extent | undefined) {
    if (MapState.#sameExtent(this.#extent, value)) return;
    this.#extent = value;
    this.emit('change:extent', { extent: value });
  }

  get mode(): MapMode { return this.#mode; }
  set mode(value: MapMode) {
    if (this.#mode === value) return;
    this.#mode = value;
    this.emit('change:mode', { mode: value });
  }

  /** Whether the map is currently in one of the drawing modes (as opposed to popup). */
  get isDrawing(): boolean {
    return this.#mode !== 'popup';
  }

  static #sameExtent(a: Extent | undefined, b: Extent | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }
}
