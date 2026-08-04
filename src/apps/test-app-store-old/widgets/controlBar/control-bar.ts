import './control-bar.css';
import type { LayersState, TocState } from '../../state/index.ts';

/**
 * A bar of bulk-action buttons for the toc: show/hide every layer, expand/collapse the
 * whole tree.
 *
 * Talks straight to the app stores — {@link LayersState} for visibility, {@link TocState}
 * for expansion — calling their bulk methods. It never enumerates the model itself.
 */
class ControlBar extends HTMLElement {
  /** Custom element tag name. Use with `document.createElement` or as an HTML tag. */
  static readonly tagName = 'control-bar';

  /** CSS class names used by this component. */
  static readonly css = {
    button:      'control-bar-button',
    checkAll:    'check-all-button',
    uncheckAll:  'uncheck-all-button',
    expandAll:   'expand-all-button',
    collapseAll: 'collapse-all-button',
  } as const;

  #layersState: LayersState | null = null;
  #tocState: TocState | null = null;

  /**
   * Binds the bar to the stores it drives. May be called before or after connect.
   * @param layersState - Store toggled by "Check all" / "Uncheck all".
   * @param tocState - Store toggled by "Expand all" / "Collapse all".
   */
  setup(layersState: LayersState, tocState: TocState): void {
    this.#layersState = layersState;
    this.#tocState = tocState;
  }

  /** Called by the browser when the element is inserted into the DOM. */
  connectedCallback(): void {
    this.#render();
  }

  /** Builds the four bulk-action buttons. */
  #render(): void {
    const { css } = ControlBar;
    this.replaceChildren(
      this.#button('Check all',    css.checkAll,    () => this.#checkAll()),
      this.#button('Uncheck all',  css.uncheckAll,  () => this.#layersState?.setAllVisible(false)),
      this.#button('Expand all',   css.expandAll,   () => this.#tocState?.expandAll()),
      this.#button('Collapse all', css.collapseAll, () => this.#tocState?.collapseAll()),
    );
  }

  /** Builds one button carrying the shared class plus a colour class. */
  #button(label: string, colorClass: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${ControlBar.css.button} ${colorClass}`;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  /** Shows every layer and expands the tree to match (collapse stays a separate action). */
  #checkAll(): void {
    this.#layersState?.setAllVisible(true);
    this.#tocState?.expandAll();
  }
}

if (!customElements.get(ControlBar.tagName)) {
  customElements.define(ControlBar.tagName, ControlBar);
}

export { ControlBar };
