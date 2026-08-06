import "./legend.css";
import type { Subscription } from "@mini/lib/core";
import type { AppStores } from "../../state/facade.ts";
import type { LayerConfig, LayerVariable, LegendItem } from "../../config/types.ts";
import { getLayerConfig, getVariable } from "../../config/index.ts";
import { selectOrderedVisibleIds } from "../../state/selectors.ts";

/** Order-independent content comparison — the echo guard for open-state writes, same rule as
 * the TOC's expansion mirroring (a freshly built array never matches by reference). */
function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * `<app-legend>` — one `<details>` section per **visible** layer, in reversed `layerOrder`,
 * showing its active variable's legend. Content is resolved through the config helpers (state
 * only ever holds the active variable id). Open state is store-backed (`expandedLegendIds`)
 * with a content-comparison echo guard, so hiding and re-showing a layer keeps its section open
 * — the set is never touched by visibility changes, only by a genuine `<details>` toggle.
 */
class LegendElement extends HTMLElement {
  static readonly tagName = "app-legend";

  #stores: AppStores | null = null;
  #configs: LayerConfig[] = [];
  #layersSubscription: Subscription | null = null;
  #uiSubscription: Subscription | null = null;

  setup(stores: AppStores, configs: LayerConfig[]): void {
    this.#stores = stores;
    this.#configs = configs;
  }

  connectedCallback(): void {
    const stores = this.#stores;
    if (!stores) return;
    this.#layersSubscription = stores.layers.subscribeMany(
      ["layersById", "layerOrder", "variableByLayerId"],
      () => this.#render(),
      { immediate: true },
    );
    this.#uiSubscription = stores.ui.subscribe("expandedLegendIds", () => this.#render());
  }

  disconnectedCallback(): void {
    this.#layersSubscription?.remove();
    this.#layersSubscription = null;
    this.#uiSubscription?.remove();
    this.#uiSubscription = null;
  }

  #render(): void {
    const stores = this.#stores;
    if (!stores) return;
    const visibleIds = selectOrderedVisibleIds(stores);
    const variableByLayerId = stores.layers.get("variableByLayerId");
    const expandedLegendIds = new Set(stores.ui.get("expandedLegendIds"));

    this.replaceChildren(
      ...visibleIds.map((id) => this.#buildSection(id, variableByLayerId[id], expandedLegendIds.has(id))),
    );
  }

  #buildSection(layerId: string, variableId: string | undefined, isOpen: boolean): HTMLElement {
    const { items, title } = this.#resolveContent(layerId, variableId);

    const details = document.createElement("details");
    details.dataset.layerId = layerId;
    details.open = isOpen;
    details.addEventListener("toggle", () => this.#onToggle(layerId, details.open));
    details.appendChild(this.#buildSummary(title, items[0]));

    const body = document.createElement("div");
    body.className = "legend-body";
    for (const item of items) body.appendChild(this.#buildItemRow(item));
    details.appendChild(body);

    return details;
  }

  #resolveContent(layerId: string, variableId: string | undefined): { items: LegendItem[]; title: string } {
    const config = getLayerConfig(this.#configs, layerId);
    const variable = this.#resolveVariable(config, variableId);
    return {
      items: variable?.legend?.items ?? [],
      title: variable?.legend?.label ?? config?.label ?? layerId,
    };
  }

  #resolveVariable(config: LayerConfig | undefined, variableId: string | undefined): LayerVariable | undefined {
    if (!config || variableId === undefined) return undefined;
    return getVariable(config, variableId);
  }

  #buildSummary(title: string, headerItem: LegendItem | undefined): HTMLElement {
    const summary = document.createElement("summary");
    const headerIcon = this.#buildSymbol(headerItem);
    if (headerIcon) summary.appendChild(headerIcon);
    const titleEl = document.createElement("span");
    titleEl.className = "legend-title";
    titleEl.textContent = title;
    summary.appendChild(titleEl);
    return summary;
  }

  #buildItemRow(item: LegendItem): HTMLElement {
    const row = document.createElement("div");
    row.className = "legend-row";
    const symbol = this.#buildSymbol(item);
    if (symbol) row.appendChild(symbol);
    const label = document.createElement("span");
    label.textContent = item.label;
    row.appendChild(label);
    return row;
  }

  #buildSymbol(item: LegendItem | undefined): HTMLElement | null {
    if (!item) return null;
    if (item.symbol) {
      const img = document.createElement("img");
      img.src = item.symbol;
      img.alt = "";
      img.className = "legend-symbol";
      return img;
    }
    if (item.color) {
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.backgroundColor = item.color;
      return swatch;
    }
    return null;
  }

  #onToggle(layerId: string, isOpen: boolean): void {
    const stores = this.#stores;
    if (!stores) return;
    const current = stores.ui.get("expandedLegendIds");
    const set = new Set(current);
    if (isOpen) set.add(layerId);
    else set.delete(layerId);

    const next = [...set];
    if (sameIdSet(current, next)) return;
    stores.ui.setLegendExpanded(next);
  }
}

if (!customElements.get(LegendElement.tagName)) {
  customElements.define(LegendElement.tagName, LegendElement);
}

export { LegendElement };
