import "./variable-switcher.css";
import type { Subscription } from "@mini/lib/core";
import type { AppStores } from "../../state/facade.ts";
import type { LayerConfig } from "../../config/types.ts";
import { getLayerConfig } from "../../config/index.ts";

/**
 * `<app-variable-switcher>` — two native `<select>`s: **layer** (all configured layers, config
 * order) and **variable** (the selected layer's variables). The selected layer is deliberately
 * **local widget state**, not store state — only the chosen variable is shared, in contrast to
 * the table (Task 22), whose layer selection *is* in the store. Changing the variable writes
 * through `stores.layers.setVariable`; the variable select otherwise mirrors
 * `variableByLayerId` for whichever layer is currently selected locally, including a change
 * made elsewhere (e.g. a restored share link).
 */
class VariableSwitcherElement extends HTMLElement {
  static readonly tagName = "app-variable-switcher";

  #stores: AppStores | null = null;
  #configs: LayerConfig[] = [];
  #subscription: Subscription | null = null;
  #layerSelect: HTMLSelectElement | null = null;
  #variableSelect: HTMLSelectElement | null = null;
  #selectedLayerId: string | null = null;

  setup(stores: AppStores, configs: LayerConfig[]): void {
    this.#stores = stores;
    this.#configs = configs;
  }

  connectedCallback(): void {
    const stores = this.#stores;
    if (!stores) return;
    this.#build();
    this.#subscription = stores.layers.subscribe("variableByLayerId", () => this.#reflectVariable(), {
      immediate: true,
    });
  }

  disconnectedCallback(): void {
    this.#subscription?.remove();
    this.#subscription = null;
  }

  #build(): void {
    this.replaceChildren();
    this.#selectedLayerId = this.#configs[0]?.id ?? null;

    this.#layerSelect = document.createElement("select");
    this.#layerSelect.setAttribute("aria-label", "Layer");
    for (const config of this.#configs) {
      const option = document.createElement("option");
      option.value = config.id;
      option.textContent = config.label;
      this.#layerSelect.appendChild(option);
    }
    this.#layerSelect.addEventListener("change", this.#onLayerChange);

    this.#variableSelect = document.createElement("select");
    this.#variableSelect.setAttribute("aria-label", "Variable");
    this.#variableSelect.addEventListener("change", this.#onVariableChange);

    this.appendChild(this.#layerSelect);
    this.appendChild(this.#variableSelect);

    this.#populateVariables();
  }

  #populateVariables(): void {
    const select = this.#variableSelect;
    if (!select || !this.#selectedLayerId) return;
    const config = getLayerConfig(this.#configs, this.#selectedLayerId);
    select.replaceChildren();
    if (!config) return;
    for (const variable of config.variables) {
      const option = document.createElement("option");
      option.value = variable.id;
      option.textContent = variable.legend?.label ?? variable.id;
      select.appendChild(option);
    }
  }

  #reflectVariable(): void {
    const stores = this.#stores;
    const select = this.#variableSelect;
    if (!stores || !select || !this.#selectedLayerId) return;
    const variableId = stores.layers.get("variableByLayerId")[this.#selectedLayerId];
    if (variableId !== undefined) select.value = variableId;
  }

  #onLayerChange = (): void => {
    if (!this.#layerSelect) return;
    this.#selectedLayerId = this.#layerSelect.value;
    this.#populateVariables();
    this.#reflectVariable();
  };

  #onVariableChange = (): void => {
    const stores = this.#stores;
    const select = this.#variableSelect;
    if (!stores || !select || !this.#selectedLayerId) return;
    stores.layers.setVariable(this.#selectedLayerId, select.value);
  };
}

if (!customElements.get(VariableSwitcherElement.tagName)) {
  customElements.define(VariableSwitcherElement.tagName, VariableSwitcherElement);
}

export { VariableSwitcherElement };
