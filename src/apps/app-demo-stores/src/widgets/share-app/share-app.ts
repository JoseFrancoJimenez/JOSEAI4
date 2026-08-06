import "./share-app.css";
import type { AppStores } from "../../state/facade.ts";
import { selectShareState } from "../../state/selectors.ts";
import { encodeShareState } from "../../share/url.ts";

/**
 * `<app-share-app>` — a single button plus a `role="status"` line. On click, reads the current
 * state **synchronously** through the Task 12 selectors (`subscribeMany` is a microtask, so a
 * click handler can't rely on subscribers having already run), encodes it, publishes it to the
 * address bar via `history.replaceState` (never a navigation), and copies it to the clipboard.
 * The address bar always updates first — clipboard access can be denied or missing entirely, and
 * that failure is reported honestly rather than silently or via a thrown error. Writes nothing
 * to any store.
 */
class ShareAppElement extends HTMLElement {
  static readonly tagName = "app-share-app";

  #stores: AppStores | null = null;

  setup(stores: AppStores): void {
    this.#stores = stores;
  }

  connectedCallback(): void {
    this.replaceChildren();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Share";
    button.addEventListener("click", this.#onClick);

    const status = document.createElement("p");
    status.setAttribute("role", "status");

    this.append(button, status);
  }

  disconnectedCallback(): void {
    this.querySelector("button")?.removeEventListener("click", this.#onClick);
  }

  #onClick = (): void => {
    const stores = this.#stores;
    if (!stores) return;
    const query = encodeShareState(selectShareState(stores));
    const url = `${location.pathname}?${query}`;
    history.replaceState(null, "", url);
    this.#copyToClipboard(url);
  };

  #copyToClipboard(url: string): void {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      this.#report("Link is in the address bar; copying failed (clipboard unavailable).");
      return;
    }
    clipboard.writeText(url).then(
      () => this.#report("Link copied to clipboard."),
      () => this.#report("Link is in the address bar; copying failed."),
    );
  }

  #report(message: string): void {
    const status = this.querySelector('[role="status"]');
    if (status) status.textContent = message;
  }
}

if (!customElements.get(ShareAppElement.tagName)) {
  customElements.define(ShareAppElement.tagName, ShareAppElement);
}

export { ShareAppElement };
