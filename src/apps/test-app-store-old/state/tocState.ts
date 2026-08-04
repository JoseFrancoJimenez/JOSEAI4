import Evented from '../../lib/core/evented.ts';

/** Event map for {@link TocState}. */
export interface ITocStateEvents {
  'change': { id: string; expanded: boolean };
}

/**
 * Tracks which toc nodes are expanded, by id.
 *
 * The app-level hub for the toc's expansion, kept in sync with the toc both ways:
 * widgets call {@link set} (which drives the toc), and the toc reports its state
 * back via {@link replace} from a `toc:change` snapshot. Extends {@link Evented};
 * subscribe to `'change'`.
 */
export class TocState extends Evented<ITocStateEvents> {
  readonly #expandable: ReadonlySet<string>;
  readonly #expanded: Set<string> = new Set();

  /** @param expandableIds - Ids of nodes that can expand (have children), so {@link expandAll} knows the universe. */
  constructor(expandableIds: Iterable<string> = []) {
    super();
    this.#expandable = new Set(expandableIds);
  }

  /** Returns whether `id` is expanded. Unknown ids are treated as collapsed. */
  isExpanded(id: string): boolean {
    return this.#expanded.has(id);
  }

  /** Returns the ids that are currently expanded. */
  expandedIds(): string[] {
    return [...this.#expanded];
  }

  /** Sets the expanded state for `id` and fires `'change'`. */
  set(id: string, expanded: boolean): void {
    if (expanded) this.#expanded.add(id);
    else this.#expanded.delete(id);
    this.emit('change', { id, expanded });
  }

  /** Flips the expanded state for `id`, fires `'change'`, and returns the new value. */
  toggle(id: string): boolean {
    const next = !this.isExpanded(id);
    this.set(id, next);
    return next;
  }

  /**
   * Replaces the whole expanded set with `ids`, firing `'change'` once per id that flips.
   * Ids already in their target state are left untouched (no event), so syncing from a
   * `toc:change` snapshot doesn't echo back and cycle.
   */
  replace(ids: Iterable<string>): void {
    const next = new Set(ids);
    for (const id of [...this.#expanded]) {
      if (!next.has(id)) this.set(id, false);
    }
    for (const id of next) {
      if (!this.#expanded.has(id)) this.set(id, true);
    }
  }

  /** Expands every expandable node, firing `'change'` per id that flips. */
  expandAll(): void {
    for (const id of this.#expandable) this.set(id, true);
  }

  /** Collapses every node. */
  collapseAll(): void {
    this.replace([]);
  }
}
