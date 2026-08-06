import "./toggle-buttons.css";
import type { Subscription } from "@mini/lib/core";
import type { AppStores } from "../../state/facade.ts";
import type { LayerConfig } from "../../config/types.ts";
import type { LayerState } from "../../state/keys.ts";

/**
 * `<app-toggle-buttons>` — one button per configured layer, in config order. The simplest
 * reader/writer in the app: pressed state mirrors `layersById[id].visible`; a click toggles it.
 * `setup()` only stores its dependencies — building and subscribing happen in
 * `connectedCallback`, since construction can precede store population.
 */
class ToggleButtonsElement extends HTMLElement {
  static readonly tagName = "app-toggle-buttons";

  #stores: AppStores | null = null;
  #configs: LayerConfig[] = [];
  #subscription: Subscription | null = null;

  setup(stores: AppStores, configs: LayerConfig[]): void {
    this.#stores = stores;
    this.#configs = configs;
  }

  connectedCallback(): void {
    if (!this.#stores) return;
    this.#build();
    this.addEventListener("click", this.#onClick);
    this.#subscription = this.#stores.layers.subscribe("layersById", (layersById) => this.#reflect(layersById), {
      immediate: true,
    });
  }

  disconnectedCallback(): void {
    this.#subscription?.remove();
    this.#subscription = null;
    this.removeEventListener("click", this.#onClick);
  }

  #build(): void {
    this.replaceChildren();
    for (const config of this.#configs) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = config.label;
      button.dataset.layerId = config.id;
      button.setAttribute("aria-pressed", "false");
      this.appendChild(button);
    }
  }

  #reflect(layersById: Record<string, LayerState>): void {
    for (const button of this.querySelectorAll<HTMLButtonElement>("button[data-layer-id]")) {
      const visible = layersById[button.dataset.layerId!]?.visible ?? false;
      button.setAttribute("aria-pressed", String(visible));
    }
  }

  #onClick = (ev: MouseEvent): void => {
    const button = (ev.target as Element).closest<HTMLButtonElement>("button[data-layer-id]");
    if (!button || !this.#stores) return;
    this.#stores.layers.toggleVisible(button.dataset.layerId!);
  };
}

if (!customElements.get(ToggleButtonsElement.tagName)) {
  customElements.define(ToggleButtonsElement.tagName, ToggleButtonsElement);
}

export { ToggleButtonsElement };
