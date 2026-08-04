import './draw.css';
import Draw, { createBox } from 'ol/interaction/Draw.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import type { Options as DrawOptions } from 'ol/interaction/Draw.js';
import type { Subscription } from '../../../lib/core/evented.ts';
import type { AppMap } from '../../map/appMap.ts';
import type { MapState, MapMode } from '../../state/index.ts';

/** The drawing modes this widget offers, paired with the button that turns each on. */
const TOOLS: { mode: Extract<MapMode, 'draw-circle' | 'draw-rectangle'>; label: string }[] = [
  { mode: 'draw-circle',    label: 'Circle' },
  { mode: 'draw-rectangle', label: 'Rectangle' },
];

/**
 * A small toolbar for drawing shapes on the map. It offers a Circle and a
 * Rectangle tool plus a Clear button, and owns a single vector layer the shapes
 * are drawn onto.
 *
 * The active tool lives in {@link MapState.mode} — the one switch this widget and
 * the popup share — so only one of them reacts to a click. Clicking a tool sets the
 * mode (clicking the active tool again returns to popup mode); the widget reacts to
 * the mode by adding/removing the matching OpenLayers {@link Draw} interaction, and
 * the popup stands down while a tool is active.
 */
class DrawWidget extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'map-draw';

  /** CSS class names used by this component. */
  static readonly css = {
    button: 'map-draw-button',
    clear:  'map-draw-clear',
    active: 'is-active',
  } as const;

  #appMap: AppMap | null = null;
  #mapState: MapState | null = null;
  #source: VectorSource | null = null;
  #layer: VectorLayer | null = null;
  #draw: Draw | null = null;
  #modeSub: Subscription | null = null;
  #buttons = new Map<MapMode, HTMLButtonElement>();

  /**
   * Binds the widget to the map it draws on and the shared mode store.
   * @param appMap - Map the drawing layer and interactions are added to.
   * @param mapState - Store whose `mode` selects the active tool (shared with the popup).
   */
  setup(appMap: AppMap, mapState: MapState): void {
    this.#appMap = appMap;
    this.#mapState = mapState;
    if (this.isConnected) {
      this.#teardown();
      this.#render();
      this.#bind();
    }
  }

  /** Called by the browser when the element is inserted into the DOM. */
  connectedCallback(): void {
    this.#render();
    this.#bind();
  }

  /** Called by the browser when the element is removed from the DOM. */
  disconnectedCallback(): void {
    this.#teardown();
  }

  /** Builds the toolbar buttons. No-op until setup has run. */
  #render(): void {
    const { css } = DrawWidget;
    if (!this.#mapState) { this.replaceChildren(); return; }

    this.#buttons.clear();
    const frag = document.createDocumentFragment();
    for (const { mode, label } of TOOLS) {
      const button = this.#button(label, css.button, () => this.#toggle(mode));
      this.#buttons.set(mode, button);
      frag.appendChild(button);
    }
    frag.appendChild(this.#button('Clear', `${css.button} ${css.clear}`, () => this.#clear()));
    this.replaceChildren(frag);
    this.#syncButtons(this.#mapState.mode);
  }

  /** Adds the drawing layer to the map and reacts to mode changes. No-op until setup has run. */
  #bind(): void {
    if (!this.#appMap || !this.#mapState || this.#layer) return;

    this.#source = new VectorSource();
    // High zIndex so drawn shapes sit above the data layers. The layer carries no
    // `id`, so AppMap.hitTest ignores it — drawings never open feature popups.
    this.#layer = new VectorLayer({ source: this.#source, zIndex: 1000 });
    this.#appMap.nativeMap.addLayer(this.#layer);

    this.#modeSub = this.#mapState.on('change:mode', ({ mode }) => this.#applyMode(mode));
    this.#applyMode(this.#mapState.mode);
  }

  /** Removes the interaction, the drawing layer, and the mode subscription. */
  #teardown(): void {
    this.#removeDraw();
    this.#modeSub?.remove();
    this.#modeSub = null;
    if (this.#layer && this.#appMap) this.#appMap.nativeMap.removeLayer(this.#layer);
    this.#layer = null;
    this.#source = null;
    this.replaceChildren();
  }

  /** Turns `mode` on, or back to popup mode when it's already the active tool. */
  #toggle(mode: MapMode): void {
    if (!this.#mapState) return;
    this.#mapState.mode = this.#mapState.mode === mode ? 'popup' : mode;
  }

  /** Clears every drawn shape and returns to popup mode. */
  #clear(): void {
    this.#source?.clear();
    if (this.#mapState) this.#mapState.mode = 'popup';
  }

  /** Swaps the OL Draw interaction to match `mode` and reflects it onto the buttons. */
  #applyMode(mode: MapMode): void {
    this.#removeDraw();

    const options = DrawWidget.#drawOptions(mode);
    if (options && this.#source && this.#appMap) {
      this.#draw = new Draw({ source: this.#source, ...options });
      this.#appMap.nativeMap.addInteraction(this.#draw);
    }

    this.#syncButtons(mode);
  }

  /** Removes the active Draw interaction from the map, if any. */
  #removeDraw(): void {
    if (this.#draw && this.#appMap) this.#appMap.nativeMap.removeInteraction(this.#draw);
    this.#draw = null;
  }

  /** Marks the button for `mode` active (and the rest inactive). */
  #syncButtons(mode: MapMode): void {
    for (const [buttonMode, button] of this.#buttons) {
      button.classList.toggle(DrawWidget.css.active, buttonMode === mode);
      button.setAttribute('aria-pressed', String(buttonMode === mode));
    }
  }

  /** The OL Draw options for a drawing mode, or `null` for popup mode (no drawing). */
  static #drawOptions(mode: MapMode): DrawOptions | null {
    switch (mode) {
      case 'draw-circle':    return { type: 'Circle' };
      case 'draw-rectangle': return { type: 'Circle', geometryFunction: createBox() };
      default:               return null;
    }
  }

  /** Builds one toolbar button wired to `onClick`. */
  #button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}

if (!customElements.get(DrawWidget.tagName)) {
  customElements.define(DrawWidget.tagName, DrawWidget);
}

export { DrawWidget };
