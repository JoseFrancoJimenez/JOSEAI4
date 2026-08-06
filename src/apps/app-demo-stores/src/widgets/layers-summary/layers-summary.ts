import "./layers-summary.css";
import type { Subscription } from "@mini/lib/core";
import type { AppStores } from "../../state/facade.ts";
import type { LayerConfig } from "../../config/types.ts";
import { getLayerConfig } from "../../config/index.ts";
import { selectOrderedVisibleIds } from "../../state/selectors.ts";

/**
 * `<app-layers-summary>` — a pure reader: two sections, **Visible** and **Hidden**, each listing
 * layer labels in reversed `layerOrder` (top-drawn first). Writes nothing, ever — this widget
 * exists to prove two decoupled widgets (this one and `toggle-buttons`) stay in sync through the
 * store alone.
 */
class LayersSummaryElement extends HTMLElement {
  static readonly tagName = "app-layers-summary";

  #stores: AppStores | null = null;
  #configs: LayerConfig[] = [];
  #subscription: Subscription | null = null;

  setup(stores: AppStores, configs: LayerConfig[]): void {
    this.#stores = stores;
    this.#configs = configs;
  }

  connectedCallback(): void {
    if (!this.#stores) return;
    this.#render();
    this.#subscription = this.#stores.layers.subscribeMany(["layersById", "layerOrder"], () => this.#render(), {
      immediate: true,
    });
  }

  disconnectedCallback(): void {
    this.#subscription?.remove();
    this.#subscription = null;
  }

  #render(): void {
    if (!this.#stores) return;
    const layersById = this.#stores.layers.get("layersById");
    const reversedOrder = [...this.#stores.layers.get("layerOrder")].reverse();

    const visibleIds = selectOrderedVisibleIds(this.#stores);
    const hiddenIds = reversedOrder.filter((id) => layersById[id]?.visible !== true);

    this.replaceChildren(this.#buildSection("Visible", visibleIds), this.#buildSection("Hidden", hiddenIds));
  }

  #buildSection(title: string, ids: string[]): HTMLElement {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.appendChild(heading);
    section.appendChild(ids.length === 0 ? this.#buildEmptyState() : this.#buildList(ids));
    return section;
  }

  #buildEmptyState(): HTMLElement {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "None";
    return empty;
  }

  #buildList(ids: string[]): HTMLElement {
    const list = document.createElement("ul");
    for (const id of ids) {
      const item = document.createElement("li");
      item.dataset.layerId = id;
      item.textContent = getLayerConfig(this.#configs, id)?.label ?? id;
      list.appendChild(item);
    }
    return list;
  }
}

if (!customElements.get(LayersSummaryElement.tagName)) {
  customElements.define(LayersSummaryElement.tagName, LayersSummaryElement);
}

export { LayersSummaryElement };
