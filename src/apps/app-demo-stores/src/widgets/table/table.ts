import "./table.css";
import type { Subscription } from "@mini/lib/core";
import type { AppStores } from "../../state/facade.ts";
import type { LayerConfig, LayerField } from "../../config/types.ts";
import { getLayerConfig } from "../../config/index.ts";
import { fetchLayerRows, paginate, TABLE_PAGE_SIZE } from "./rows.ts";

/** A feature property's value is `unknown` — render primitives directly, and anything else
 * (a nested object/array, an unexpected shape) as JSON rather than risking `[object Object]`. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * `<app-table>` — a layer `<select>` bound to `stores.ui.tableLayerId` (in the store because
 * it's part of the share link), columns from the selected layer's `fields`, and rows from
 * `rows.ts`, paged from `stores.ui.tablePage`. The table queries the selected layer's data
 * regardless of that layer's visibility. Heavy data never enters the store — rows live only in
 * this widget's per-instance cache, keyed by layer id, so switching pages within a layer never
 * re-fetches. A per-instance incrementing token drops any response superseded by a later
 * layer/page request before it paints. Changing the layer resets the page — `tableLayerId` and
 * `tablePage` are written in **one batch**, so the resulting reflect+fetch runs once, not twice.
 */
class TableElement extends HTMLElement {
  static readonly tagName = "app-table";

  #stores: AppStores | null = null;
  #configs: LayerConfig[] = [];
  #subscription: Subscription | null = null;
  #layerSelect: HTMLSelectElement | null = null;
  #headRow: HTMLTableRowElement | null = null;
  #body: HTMLTableSectionElement | null = null;
  #prevButton: HTMLButtonElement | null = null;
  #nextButton: HTMLButtonElement | null = null;

  #featuresCache = new Map<string, Promise<Record<string, unknown>[]>>();
  #requestToken = 0;

  setup(stores: AppStores, configs: LayerConfig[]): void {
    this.#stores = stores;
    this.#configs = configs;
  }

  connectedCallback(): void {
    const stores = this.#stores;
    if (!stores) return;
    this.#build();
    this.#subscription = stores.ui.subscribeMany(["tableLayerId", "tablePage"], () => this.#reflect(), {
      immediate: true,
    });
  }

  disconnectedCallback(): void {
    this.#subscription?.remove();
    this.#subscription = null;
    this.#requestToken++; // drop any in-flight response after disconnect
  }

  #build(): void {
    this.replaceChildren();

    this.#layerSelect = document.createElement("select");
    this.#layerSelect.setAttribute("aria-label", "Table layer");
    for (const config of this.#configs) {
      const option = document.createElement("option");
      option.value = config.id;
      option.textContent = config.label;
      this.#layerSelect.appendChild(option);
    }
    this.#layerSelect.addEventListener("change", this.#onLayerChange);
    this.appendChild(this.#layerSelect);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    this.#headRow = document.createElement("tr");
    thead.appendChild(this.#headRow);
    this.#body = document.createElement("tbody");
    table.append(thead, this.#body);
    this.appendChild(table);

    this.appendChild(this.#buildPager());
  }

  #buildPager(): HTMLElement {
    const pager = document.createElement("div");
    pager.className = "pager";
    this.#prevButton = document.createElement("button");
    this.#prevButton.type = "button";
    this.#prevButton.textContent = "Prev";
    this.#prevButton.disabled = true;
    this.#prevButton.addEventListener("click", () => this.#changePage(-1));
    this.#nextButton = document.createElement("button");
    this.#nextButton.type = "button";
    this.#nextButton.textContent = "Next";
    this.#nextButton.disabled = true;
    this.#nextButton.addEventListener("click", () => this.#changePage(1));
    pager.append(this.#prevButton, this.#nextButton);
    return pager;
  }

  #changePage(delta: number): void {
    const stores = this.#stores;
    if (!stores) return;
    stores.ui.setPage(stores.ui.get("tablePage") + delta);
  }

  /** Resolves `tableLayerId` (falling back to the first configured layer when `null`, without
   * writing that fallback anywhere), renders that layer's columns, and kicks off its rows. */
  #reflect(): void {
    const stores = this.#stores;
    const select = this.#layerSelect;
    if (!stores || !select) return;
    const layerId = stores.ui.get("tableLayerId") ?? this.#configs[0]?.id;
    if (layerId === undefined) return;
    if (select.value !== layerId) select.value = layerId;

    const config = getLayerConfig(this.#configs, layerId);
    this.#renderColumns(config?.fields ?? []);
    if (config) this.#loadRows(config, stores.ui.get("tablePage"));
  }

  #renderColumns(fields: LayerField[]): void {
    const headRow = this.#headRow;
    if (!headRow) return;
    headRow.replaceChildren();
    for (const field of fields) {
      const th = document.createElement("th");
      th.textContent = field.label;
      th.dataset.fieldId = field.id;
      headRow.appendChild(th);
    }
  }

  #loadRows(config: LayerConfig, page: number): void {
    const token = ++this.#requestToken;
    this.#setStatusRow(config.fields.length, "Loading…");

    this.#featuresFor(config).then(
      (features) => {
        if (token !== this.#requestToken) return; // superseded by a later layer/page request
        this.#renderRows(config.fields, paginate(features, page));
        this.#updatePager(page, features.length);
      },
      () => {
        if (token !== this.#requestToken) return;
        this.#setStatusRow(config.fields.length, "Failed to load data.");
      },
    );
  }

  #featuresFor(config: LayerConfig): Promise<Record<string, unknown>[]> {
    const cached = this.#featuresCache.get(config.id);
    if (cached) return cached;
    const promise = fetchLayerRows(config);
    this.#featuresCache.set(config.id, promise);
    return promise;
  }

  #renderRows(fields: LayerField[], rows: Record<string, unknown>[]): void {
    const body = this.#body;
    if (!body) return;
    if (rows.length === 0) {
      this.#setStatusRow(fields.length, "No data");
      return;
    }
    body.replaceChildren(
      ...rows.map((row) => {
        const tr = document.createElement("tr");
        for (const field of fields) {
          const td = document.createElement("td");
          td.textContent = cellText(row[field.id]);
          tr.appendChild(td);
        }
        return tr;
      }),
    );
  }

  #setStatusRow(columnCount: number, message: string): void {
    const body = this.#body;
    if (!body) return;
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = Math.max(columnCount, 1);
    cell.textContent = message;
    row.appendChild(cell);
    body.replaceChildren(row);
  }

  #updatePager(page: number, total: number): void {
    if (this.#prevButton) this.#prevButton.disabled = page <= 1;
    if (this.#nextButton) this.#nextButton.disabled = page * TABLE_PAGE_SIZE >= total;
  }

  #onLayerChange = (): void => {
    const stores = this.#stores;
    const select = this.#layerSelect;
    if (!stores || !select) return;
    stores.ui.batch(() => {
      stores.ui.setTableLayer(select.value);
      stores.ui.setPage(1);
    });
  };
}

if (!customElements.get(TableElement.tagName)) {
  customElements.define(TableElement.tagName, TableElement);
}

export { TableElement };
