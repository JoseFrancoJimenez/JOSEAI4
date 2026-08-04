import './table.css';
import type { Subscription } from '../../../lib/core/evented.ts';
import type { DataSourceRegistry } from '../../../lib/maps/data/dataSourceFactory.ts';
import type { QueryResult } from '../../../lib/maps/data/types.ts';
import type { LayersState, LayerDescriptor, TableState } from '../../state/index.ts';

/**
 * A feature table driven by {@link TableState}. A row of layer checkboxes picks
 * one active layer (single-select); below it, that layer's features are shown in
 * a paged table whose columns are the layer's fields. The selectable layers and
 * their columns are read straight from {@link LayersState}; rows are fetched through
 * the layer's {@link import('../../../lib/maps/data/types.ts').LayerDataSource}, one
 * page at a time, so large datasets never load whole.
 */
class TableWidget extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'feature-table';

  /** CSS class names used by this component. */
  static readonly css = {
    root:     'feature-table',
    picker:   'feature-table-picker',
    option:   'feature-table-option',
    scroll:   'feature-table-scroll',
    table:    'feature-table-grid',
    empty:    'feature-table-empty',
    pager:    'feature-table-pager',
    prev:     'feature-table-prev',
    next:     'feature-table-next',
    pageInfo: 'feature-table-page-info',
  } as const;

  #tableState: TableState | null = null;
  #dataSources: DataSourceRegistry = new Map();
  #layers: LayerDescriptor[] = [];
  #layersById = new Map<string, LayerDescriptor>();
  #subscription: Subscription | null = null;

  /** Aborts the in-flight query when a newer one starts (or the widget detaches). */
  #controller: AbortController | null = null;

  #pickerEl: HTMLElement | null = null;
  #scrollEl: HTMLElement | null = null;
  #pagerEl: HTMLElement | null = null;

  /**
   * Binds the table to its state and data sources. The selectable layers and their
   * columns are read from {@link LayersState}. May be called before or after the
   * element is connected.
   * @param layersState - Store the selectable layers and their columns are read from.
   * @param tableState - Store holding the selected layer, page, and page size.
   * @param dataSources - Layer id → data source used to fetch pages.
   */
  setup(layersState: LayersState, tableState: TableState, dataSources: DataSourceRegistry): void {
    this.#layers = layersState.descriptors();
    this.#layersById = new Map(this.#layers.map(layer => [layer.id, layer]));
    this.#tableState = tableState;
    this.#dataSources = dataSources;
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

  /** Subscribes to state changes and loads the current page. */
  #bind(): void {
    if (!this.#tableState || this.#subscription) return;
    this.#subscription = this.#tableState.on('change', () => {
      this.#syncPicker();
      this.#reload();
    });
    this.#reload();
  }

  /** Cancels the subscription and any in-flight query. */
  #cleanup(): void {
    this.#subscription?.remove();
    this.#subscription = null;
    this.#controller?.abort();
    this.#controller = null;
  }

  /** Builds the persistent shell: layer picker, table container, pager. */
  #render(): void {
    const { css } = TableWidget;
    this.className = css.root;

    const picker = document.createElement('div');
    picker.className = css.picker;
    for (const layer of this.#layers) {
      const option = document.createElement('label');
      option.className = css.option;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.layerId = layer.id;
      checkbox.checked = this.#tableState?.selectedLayerId === layer.id;
      checkbox.addEventListener('change', () => this.#pick(layer.id, checkbox.checked));
      option.append(checkbox, document.createTextNode(layer.label));
      picker.appendChild(option);
    }

    const scroll = document.createElement('div');
    scroll.className = css.scroll;

    const pager = document.createElement('div');
    pager.className = css.pager;

    this.#pickerEl = picker;
    this.#scrollEl = scroll;
    this.#pagerEl = pager;
    this.replaceChildren(picker, scroll, pager);
  }

  /** Single-select: picking a layer clears the others; unchecking clears the table. */
  #pick(id: string, checked: boolean): void {
    this.#tableState?.select(checked ? id : undefined);
  }

  /** Reflects the selected layer onto the picker checkboxes. */
  #syncPicker(): void {
    const selected = this.#tableState?.selectedLayerId;
    this.#pickerEl?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => {
      cb.checked = cb.dataset.layerId === selected;
    });
  }

  /** Fetches the current page for the selected layer and renders it. */
  #reload(): void {
    const state = this.#tableState;
    if (!state || !this.#scrollEl) return;

    const id = state.selectedLayerId;
    if (!id) { this.#showMessage('Select a layer to see its features.'); this.#renderPager(undefined); return; }

    const source = this.#dataSources.get(id);
    if (!source) { this.#showMessage(`No data source for layer "${id}".`); this.#renderPager(undefined); return; }

    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;

    const { page, pageSize } = state;
    this.#showMessage('Loading…');
    source
      .query({ page: { offset: page * pageSize, limit: pageSize } }, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        this.#renderTable(id, result);
        this.#renderPager(result);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        this.#showMessage(`Failed to load features: ${err instanceof Error ? err.message : String(err)}`);
        this.#renderPager(undefined);
      });
  }

  /** Renders the header (layer fields) and the page's rows into the table container. */
  #renderTable(layerId: string, result: QueryResult): void {
    const def = this.#layersById.get(layerId);
    if (!def || !this.#scrollEl) return;

    const { css } = TableWidget;
    const table = document.createElement('table');
    table.className = css.table;

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const field of def.fields) {
      const th = document.createElement('th');
      th.textContent = field.label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    if (result.features.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = def.fields.length || 1;
      td.className = css.empty;
      td.textContent = 'No features on this page.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (const feature of result.features) {
        const tr = document.createElement('tr');
        for (const field of def.fields) {
          const td = document.createElement('td');
          const value = feature.properties[field.id];
          td.textContent = value == null ? '—' : String(value);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);

    this.#scrollEl.replaceChildren(table);
  }

  /** Shows a single centred message (empty / loading / error) in the table area. */
  #showMessage(message: string): void {
    if (!this.#scrollEl) return;
    const el = document.createElement('div');
    el.className = TableWidget.css.empty;
    el.textContent = message;
    this.#scrollEl.replaceChildren(el);
  }

  /** Renders the pager for a result, or clears it when there's nothing to page. */
  #renderPager(result: QueryResult | undefined): void {
    if (!this.#pagerEl || !this.#tableState) return;
    if (!result) { this.#pagerEl.replaceChildren(); return; }

    const { css } = TableWidget;
    const { page, pageSize } = this.#tableState;
    const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = css.prev;
    prev.textContent = '‹ Prev';
    prev.disabled = page <= 0;
    prev.addEventListener('click', () => this.#tableState!.setPage(page - 1));

    const info = document.createElement('span');
    info.className = css.pageInfo;
    info.textContent = `Page ${page + 1} / ${totalPages} · ${result.total} feature${result.total === 1 ? '' : 's'}`;

    const next = document.createElement('button');
    next.type = 'button';
    next.className = css.next;
    next.textContent = 'Next ›';
    next.disabled = page + 1 >= totalPages;
    next.addEventListener('click', () => this.#tableState!.setPage(page + 1));

    this.#pagerEl.replaceChildren(prev, info, next);
  }
}

if (!customElements.get(TableWidget.tagName)) {
  customElements.define(TableWidget.tagName, TableWidget);
}

export { TableWidget };
