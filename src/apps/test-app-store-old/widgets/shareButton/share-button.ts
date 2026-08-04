import './share-button.css';
import type { LayersState, TocState, MapState, TableState } from '../../state/index.ts';
import { buildShareUrl } from '../../share.ts';

/**
 * A "Share this app" widget.
 *
 * On click it reads the current app state straight from the stores
 * ({@link LayersState} for layer visibility, {@link TocState} for expansion) —
 * exactly as they hold it — encodes it into a shareable link, writes that link to
 * the address bar, and copies it to the clipboard, reporting the result in a short
 * status line. Opening the link restores the shared state; the application's
 * composition root decodes it on load.
 */
class ShareButton extends HTMLElement {
  /** Custom element tag name. Use with `document.createElement` or as an HTML tag. */
  static readonly tagName = 'share-button';

  /** CSS class names used by this component. */
  static readonly css = {
    action: 'share-button-action',
    status: 'share-button-status',
  } as const;

  #layersState: LayersState | null = null;
  #tocState: TocState | null = null;
  #mapState: MapState | null = null;
  #tableState: TableState | null = null;

  #status: HTMLElement | null = null;

  /**
   * Binds the widget to the stores it reads. May be called before or after connect.
   * @param layersState - Store whose visible layer ids go into the link.
   * @param tocState - Store whose expanded ids go into the link.
   * @param mapState - Store whose center/zoom go into the link.
   * @param tableState - Store whose selected layer + page go into the link.
   */
  setup(layersState: LayersState, tocState: TocState, mapState: MapState, tableState: TableState): void {
    this.#layersState = layersState;
    this.#tocState = tocState;
    this.#mapState = mapState;
    this.#tableState = tableState;
  }

  /** Called by the browser when the element is inserted into the DOM. */
  connectedCallback(): void {
    this.#render();
  }

  /** Builds the trigger button and its status line. */
  #render(): void {
    const { css } = ShareButton;

    const action = document.createElement('button');
    action.type = 'button';
    action.className = css.action;
    action.textContent = 'Share this app';
    action.addEventListener('click', () => { void this.#share(); });

    const status = document.createElement('p');
    status.className = css.status;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    this.#status = status;

    this.replaceChildren(action, status);
  }

  /** Reads the stores as-is, builds the link, then updates the URL and copies it. */
  async #share(): Promise<void> {
    if (!this.#layersState || !this.#tocState || !this.#mapState || !this.#tableState) return;

    // Visible-layer and expanded ids go into the link exactly as the stores hold
    // them — no filtering for what's currently on screen. The map view (center +
    // zoom) and the table (selected layer + page) ride along so the link reopens
    // looking at the same place, on the same table page.
    const url = buildShareUrl({
      checked: this.#layersState.visibleIds(),
      expanded: this.#tocState.expandedIds(),
      view: { center: this.#mapState.center, zoom: this.#mapState.zoom },
      table: {
        layer: this.#tableState.selectedLayerId,
        page: this.#tableState.page,
        pageSize: this.#tableState.pageSize,
      },
    });

    // Reflect the link in the address bar so it can be shared straight from
    // there. `replaceState` updates the current entry rather than pushing a new
    // one, so it doesn't clutter the back button.
    window.history.replaceState(window.history.state, '', url);

    const copied = await this.#copy(url);
    this.#setStatus(copied
      ? 'Link copied to clipboard'
      : 'Link is in the address bar — copy it from there');
  }

  /** Attempts to copy `text` to the clipboard; returns whether it succeeded. */
  async #copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API is unavailable (insecure context) or the user denied it —
      // the address bar now holds the link as the fallback.
      return false;
    }
  }

  /** Updates the live status line under the button. */
  #setStatus(message: string): void {
    if (this.#status) this.#status.textContent = message;
  }
}

if (!customElements.get(ShareButton.tagName)) {
  customElements.define(ShareButton.tagName, ShareButton);
}

export { ShareButton };
