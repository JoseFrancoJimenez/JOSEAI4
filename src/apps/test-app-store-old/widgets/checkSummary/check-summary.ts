import './check-summary.css';
import type { LayersState, LayerDescriptor } from '../../state/index.ts';
import type { Subscription } from '../../../lib/core/evented.ts';

/**
 * Displays a live summary of a {@link LayersState}: a visible count, a hidden
 * count, and the list of currently-visible layers.
 *
 * It reads everything it needs — the layer list (for the total and labels) and
 * their visibility — straight from the store, so {@link setup} takes just the
 * state. Re-renders whenever the state fires `'change:visible'`.
 */
class CheckSummary extends HTMLElement {
  /** Custom element tag name. Use with `document.createElement` or as an HTML tag. */
  static readonly tagName = 'check-summary';

  /** CSS class names used by this component. */
  static readonly css = {
    counts:     'check-summary-counts',
    count:      'check-summary-count',
    countValue: 'check-summary-count-value',
    countLabel: 'check-summary-count-label',
    list:       'check-summary-list',
    empty:      'check-summary-empty',
  } as const;

  #state: LayersState | null = null;
  #subscription: Subscription | null = null;

  /**
   * Binds the component to the state it summarises. The layer list (the universe
   * for the counts) is read from the store's descriptors. May be called before or
   * after the element is connected to the DOM.
   * @param state - The {@link LayersState} to summarise and subscribe to.
   */
  setup(state: LayersState): void {
    this.#state = state;
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
  }

  /** Called by the browser when the element is removed from the DOM. */
  disconnectedCallback(): void {
    this.#cleanup();
  }

  /** Subscribes to state changes so the summary stays live. */
  #bind(): void {
    if (!this.#state || this.#subscription) return;
    this.#subscription = this.#state.on('change:visible', () => this.#render());
  }

  /** Removes the state subscription. */
  #cleanup(): void {
    this.#subscription?.remove();
    this.#subscription = null;
  }

  /** Rebuilds the counts and the checked-items list from the current state. */
  #render(): void {
    const { css } = CheckSummary;
    if (!this.#state) { this.replaceChildren(); return; }

    const items: LayerDescriptor[] = this.#state.descriptors();
    const checkedItems = items.filter(item => this.#state!.isVisible(item.id));
    const checkedCount = checkedItems.length;
    const uncheckedCount = items.length - checkedCount;

    const counts = document.createElement('div');
    counts.className = css.counts;
    counts.append(
      this.#buildCount(checkedCount, 'visible'),
      this.#buildCount(uncheckedCount, 'hidden'),
    );

    const frag = document.createDocumentFragment();
    frag.appendChild(counts);

    if (checkedItems.length) {
      const list = document.createElement('ul');
      list.className = css.list;
      for (const item of checkedItems) {
        const li = document.createElement('li');
        li.textContent = item.label;
        list.appendChild(li);
      }
      frag.appendChild(list);
    } else {
      const empty = document.createElement('p');
      empty.className = css.empty;
      empty.textContent = 'Nothing visible';
      frag.appendChild(empty);
    }

    this.replaceChildren(frag);
  }

  /** Builds a single labelled count tile. */
  #buildCount(value: number, label: string): HTMLElement {
    const { css } = CheckSummary;
    const tile = document.createElement('div');
    tile.className = css.count;

    const valueEl = document.createElement('span');
    valueEl.className = css.countValue;
    valueEl.textContent = String(value);

    const labelEl = document.createElement('span');
    labelEl.className = css.countLabel;
    labelEl.textContent = label;

    tile.append(valueEl, labelEl);
    return tile;
  }
}

if (!customElements.get(CheckSummary.tagName)) {
  customElements.define(CheckSummary.tagName, CheckSummary);
}

export { CheckSummary };
