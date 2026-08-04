import './toggle-buttons.css';
import type { Subscription } from '../../../lib/core/evented.ts';
import type { LayersState } from '../../state/index.ts';

/**
 * A row of per-layer visibility toggles, driven straight by {@link LayersState}.
 *
 * One button per layer (built from the store's descriptors): clicking it flips that
 * layer's visibility in the store, and visibility changes from anywhere mirror back
 * onto the button's styling. The widget only ever talks to the store — it never
 * touches the underlying layer objects. The composition root just calls {@link setup}.
 */
class ToggleButtons extends HTMLElement {
  /** Custom element tag name. Use with `document.createElement` or as an HTML tag. */
  static readonly tagName = 'toggle-buttons';

  /** CSS class names used by this component. */
  static readonly css = {
    button:    'toggle-button',
    checked:   'is-checked',
    unchecked: 'is-unchecked',
  } as const;

  #layersState: LayersState | null = null;
  #buttons: Map<string, HTMLButtonElement> = new Map();
  #subscription: Subscription | null = null;

  /**
   * Binds the toggles to the layer store they read and write.
   * May be called before or after the element is connected to the DOM.
   * @param layersState - Source of truth for visibility; the buttons read and write it.
   */
  setup(layersState: LayersState): void {
    this.#layersState = layersState;
    if (this.isConnected) {
      this.#cleanup();
      this.#render();
      this.#bind();
    }
  }

  /** Called by the browser when the element is inserted into the DOM. */
  connectedCallback(): void {
    this.#render();
    this.#bind();
    this.addEventListener('click', this.#handleClick);
  }

  /** Called by the browser when the element is removed from the DOM. */
  disconnectedCallback(): void {
    this.removeEventListener('click', this.#handleClick);
    this.#cleanup();
  }

  /** Mirrors visibility changes (from anywhere) back onto the buttons. No-op until setup has run. */
  #bind(): void {
    if (!this.#layersState || this.#subscription) return;
    this.#subscription = this.#layersState.on('change:visible', ({ id, visible }) =>
      this.#applyStyle(id, visible),
    );
  }

  /** Removes the store subscription. */
  #cleanup(): void {
    this.#subscription?.remove();
    this.#subscription = null;
  }

  /** Builds one button per layer, styled to match its current visibility. No-op until setup has run. */
  #render(): void {
    this.#buttons.clear();
    if (!this.#layersState) { this.replaceChildren(); return; }

    const frag = document.createDocumentFragment();
    for (const { id, label } of this.#layersState.descriptors()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = ToggleButtons.css.button;
      button.textContent = label;
      button.dataset.id = id;
      this.#style(button, this.#layersState.isVisible(id));
      this.#buttons.set(id, button);
      frag.appendChild(button);
    }
    this.replaceChildren(frag);
  }

  /** Delegated click handler: flips the clicked layer's visibility in the store. */
  #handleClick = (ev: MouseEvent): void => {
    const target = ev.target as Element;
    const id = target.closest<HTMLButtonElement>(`.${ToggleButtons.css.button}`)?.dataset.id;
    if (!id || !this.#layersState) return;
    this.#layersState.setVisible(id, !this.#layersState.isVisible(id));
  };

  /** Reflects `visible` onto the button registered for `id` (no-op if it isn't rendered). */
  #applyStyle(id: string, visible: boolean): void {
    const button = this.#buttons.get(id);
    if (button) this.#style(button, visible);
  }

  /** Reflects `visible` onto a button's class list and aria state. */
  #style(button: HTMLButtonElement, visible: boolean): void {
    button.classList.toggle(ToggleButtons.css.checked, visible);
    button.classList.toggle(ToggleButtons.css.unchecked, !visible);
    button.setAttribute('aria-pressed', String(visible));
  }
}

if (!customElements.get(ToggleButtons.tagName)) {
  customElements.define(ToggleButtons.tagName, ToggleButtons);
}

export { ToggleButtons };
