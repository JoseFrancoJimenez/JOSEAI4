import './popup.css';
import Overlay from 'ol/Overlay.js';
import type { Subscription } from '../../../lib/core/evented.ts';
import type { AppMap, HitTestResult } from '../../map/appMap.ts';
import type { LayersState, MapState } from '../../state/index.ts';

/**
 * A map popup driven by clicks. On each map click it runs {@link AppMap.hitTest}
 * over the clicked pixel and, when anything is hit, opens an OpenLayers overlay
 * at that spot. Layers are paged one at a time — the popup shows a single layer's
 * hit features with `‹ / ›` navigation between the layers that were hit. Resolves
 * layer labels through {@link LayersState}.
 *
 * Clicks are only handled while {@link MapState} is in popup mode; when a drawing
 * tool is active the popup stands down (and closes any open popup) so it and the
 * draw widget never both react to the same click.
 *
 * The custom element renders nothing itself; it owns an overlay element attached
 * to the map. Call {@link setup} before connecting it.
 */
class PopupWidget extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'map-popup';

  /** CSS class names used by this component. */
  static readonly css = {
    popup:     'popup',
    close:     'popup-close',
    nav:       'popup-nav',
    prev:      'popup-prev',
    next:      'popup-next',
    pageInfo:  'popup-page-info',
    layerName: 'popup-layer-name',
    body:      'popup-body',
    feature:   'popup-feature',
    field:     'popup-field',
    fieldKey:  'popup-field-key',
    fieldVal:  'popup-field-val',
  } as const;

  #appMap: AppMap | null = null;
  #layersState: LayersState | null = null;
  #mapState: MapState | null = null;
  #overlay: Overlay | null = null;
  #clickSub: Subscription | null = null;
  #modeSub: Subscription | null = null;

  #results: HitTestResult[] = [];
  #page = 0;

  readonly #el: HTMLElement;

  constructor() {
    super();
    const { css } = PopupWidget;
    this.#el = document.createElement('div');
    this.#el.className = css.popup;
    this.#el.hidden = true;
    this.#el.innerHTML = `
      <button class="${css.close}" type="button" aria-label="Close">&#x2715;</button>
      <div class="${css.nav}">
        <button class="${css.prev}" type="button" aria-label="Previous layer">&#x2039;</button>
        <span class="${css.pageInfo}" role="status"></span>
        <button class="${css.next}" type="button" aria-label="Next layer">&#x203A;</button>
      </div>
      <div class="${css.layerName}"></div>
      <div class="${css.body}"></div>
    `;
  }

  /**
   * Binds the popup to the map it listens on and the stores it reads.
   * @param appMap - Map whose clicks open the popup and whose hitTest it queries.
   * @param layersState - Store used to resolve a hit layer's id to its label.
   * @param mapState - Store whose `mode` gates clicks (popup stands down while drawing).
   */
  setup(appMap: AppMap, layersState: LayersState, mapState: MapState): void {
    this.#appMap = appMap;
    this.#layersState = layersState;
    this.#mapState = mapState;
    // When declared in HTML, connectedCallback runs (a no-op) before setup — bind now.
    if (this.isConnected) this.#bind();
  }

  /** Called by the browser when the element is inserted into the DOM. */
  connectedCallback(): void {
    this.#bind();
  }

  /** Called by the browser when the element is removed from the DOM. */
  disconnectedCallback(): void {
    this.#cleanup();
  }

  /** Adds the overlay to the map and wires the click and navigation handlers. */
  #bind(): void {
    if (!this.#appMap || this.#overlay) return;

    this.#overlay = new Overlay({
      element: this.#el,
      positioning: 'bottom-center',
      offset: [0, -12],
      stopEvent: true,
    });
    this.#appMap.nativeMap.addOverlay(this.#overlay);

    this.#clickSub = this.#appMap.on('click', (e) => {
      // A drawing tool owns clicks while it's active; leave any open popup as-is.
      if (this.#mapState?.isDrawing) return;
      const results = this.#appMap!.hitTest(e.pixel as [number, number]);
      if (results.length) this.#show(results, e.coordinate as [number, number]);
      else this.#hide();
    });

    // Entering a drawing mode closes any open popup so the two don't overlap.
    this.#modeSub = this.#mapState?.on('change:mode', ({ mode }) => {
      if (mode !== 'popup') this.#hide();
    }) ?? null;

    const { css } = PopupWidget;
    this.#el.querySelector(`.${css.close}`)!.addEventListener('click', () => this.#hide());
    this.#el.querySelector(`.${css.prev}`)!.addEventListener('click', () => this.#step(-1));
    this.#el.querySelector(`.${css.next}`)!.addEventListener('click', () => this.#step(1));
  }

  /** Removes the subscriptions and detaches the overlay from the map. */
  #cleanup(): void {
    this.#clickSub?.remove();
    this.#clickSub = null;
    this.#modeSub?.remove();
    this.#modeSub = null;
    if (this.#overlay && this.#appMap) {
      this.#appMap.nativeMap.removeOverlay(this.#overlay);
    }
    this.#overlay = null;
  }

  /** Opens the popup on the first hit layer at `coordinate`. */
  #show(results: HitTestResult[], coordinate: [number, number]): void {
    this.#results = results;
    this.#page = 0;
    this.#render();
    this.#el.hidden = false;
    this.#overlay!.setPosition(coordinate);
  }

  /** Closes the popup and clears its position so the overlay stops rendering. */
  #hide(): void {
    this.#el.hidden = true;
    this.#results = [];
    this.#overlay?.setPosition(undefined);
  }

  /** Moves `delta` layers, clamped to the range of hit layers, and re-renders. */
  #step(delta: number): void {
    const next = this.#page + delta;
    if (next < 0 || next >= this.#results.length) return;
    this.#page = next;
    this.#render();
  }

  /** Renders the current layer's page: its label, the pager, and its features. */
  #render(): void {
    const { css } = PopupWidget;
    const result = this.#results[this.#page];
    if (!result) return;

    const total = this.#results.length;
    const label = this.#layersState?.getLayer(result.id)?.label ?? result.id;

    this.#el.querySelector(`.${css.pageInfo}`)!.textContent = `Layer ${this.#page + 1} / ${total}`;
    (this.#el.querySelector(`.${css.nav}`) as HTMLElement).hidden = total <= 1;

    const name = this.#el.querySelector(`.${css.layerName}`)!;
    name.textContent = `${label} · ${result.features.length} feature${result.features.length === 1 ? '' : 's'}`;

    this.#el.querySelector(`.${css.body}`)!.innerHTML = result.features
      .map(feature => this.#featureHtml(feature.getProperties()))
      .join('');

    const prev = this.#el.querySelector<HTMLButtonElement>(`.${css.prev}`)!;
    const next = this.#el.querySelector<HTMLButtonElement>(`.${css.next}`)!;
    prev.disabled = this.#page === 0;
    next.disabled = this.#page === total - 1;
  }

  /** Renders one feature's non-geometry properties as key/value rows. */
  #featureHtml(props: Record<string, unknown>): string {
    const { css } = PopupWidget;
    const rows = Object.entries(props)
      .filter(([key]) => key !== 'geometry')
      .map(([key, value]) => `
        <div class="${css.field}">
          <span class="${css.fieldKey}">${escapeHtml(key)}</span>
          <span class="${css.fieldVal}">${escapeHtml(value == null ? '—' : String(value))}</span>
        </div>
      `)
      .join('');
    return `<div class="${css.feature}">${rows}</div>`;
  }
}

/** Escapes the five HTML-significant characters so untrusted data can't inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (!customElements.get(PopupWidget.tagName)) {
  customElements.define(PopupWidget.tagName, PopupWidget);
}

export { PopupWidget };
