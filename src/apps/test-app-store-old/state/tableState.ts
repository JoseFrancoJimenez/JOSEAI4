import Evented from '../../lib/core/evented.ts';

/** Event map for {@link TableState}. */
export interface ITableStateEvents {
  /** The whole table intent changed (selected layer, page, or page size). */
  'change': { selectedLayerId: string | undefined; page: number; pageSize: number };
}

/**
 * State for the table widget: which layer the table shows and where in its paged
 * feature list it is. Holds only the query *intent* (selected layer + page +
 * pageSize) — the fetched rows and total live in the widget, which re-queries its
 * {@link import('../../lib/maps/data/types.ts').LayerDataSource} on every `change`.
 * Extends {@link Evented}.
 */
export class TableState extends Evented<ITableStateEvents> {
  #selectedLayerId: string | undefined;
  #page = 0;
  #pageSize: number;

  /** @param pageSize - Rows per page (default 10). */
  constructor(pageSize = 10) {
    super();
    this.#pageSize = pageSize;
  }

  get selectedLayerId(): string | undefined { return this.#selectedLayerId; }
  get page(): number { return this.#page; }
  get pageSize(): number { return this.#pageSize; }

  /** Selects the layer the table shows (or clears it), resetting to the first page. */
  select(id: string | undefined): void {
    if (this.#selectedLayerId === id) return;
    this.#selectedLayerId = id;
    this.#page = 0;
    this.#emit();
  }

  /** Moves to a 0-based page. No-op if unchanged. */
  setPage(page: number): void {
    if (this.#page === page) return;
    this.#page = page;
    this.#emit();
  }

  /** Changes the page size, resetting to the first page. No-op if unchanged. */
  setPageSize(pageSize: number): void {
    if (this.#pageSize === pageSize) return;
    this.#pageSize = pageSize;
    this.#page = 0;
    this.#emit();
  }

  /** Restores the whole table intent in one go (e.g. from a share link), firing a single `change`. */
  restore(state: { selectedLayerId: string | undefined; page: number; pageSize: number }): void {
    this.#selectedLayerId = state.selectedLayerId;
    this.#page = state.page;
    this.#pageSize = state.pageSize;
    this.#emit();
  }

  #emit(): void {
    this.emit('change', {
      selectedLayerId: this.#selectedLayerId,
      page: this.#page,
      pageSize: this.#pageSize,
    });
  }
}
