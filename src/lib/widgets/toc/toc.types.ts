import type { Subscription } from '../../core/evented.ts';

/** Raw config shape — one item from the flat input array. */
interface ITocNodeDef {
  id: string;
  parent_id: string | null;
  type: string;
}

/** Read-only runtime view of a node exposed by {@link TocModel}. */
interface ITocNode {
  readonly id: string;
  readonly type: string;
  readonly parent: ITocNode | null;
  readonly children: readonly ITocNode[];
  readonly depth: number;
}

/** Event map for {@link TocModel}. */
interface ITocModelEvents {
  'change': Record<string, never>;
  'clear':  Record<string, never>;
  'add':    { node: ITocNode };
  'remove': { node: ITocNode };
  'move':   { node: ITocNode; previousParent: ITocNode | null };
}

/**
 * Read-only surface of {@link TocModel} — everything a consumer may do without mutating the tree.
 * Widgets are configured with this interface (never the writable one) so the compiler, not
 * convention, enforces single-writer.
 */
interface ITocModelReadable {
  readonly roots: readonly ITocNode[];
  get(id: string): ITocNode | undefined;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<ITocNode>;
  on<K extends keyof ITocModelEvents>(event: K, handler: (payload: ITocModelEvents[K]) => void): Subscription;
}

/** Full surface of {@link TocModel}, including mutation. Held only by whoever owns the tree. */
interface ITocModelWritable extends ITocModelReadable {
  add(def: ITocNodeDef): void;
  remove(id: string): void;
  move(id: string, newParentId: string | null): void;
  clear(): void;
}

export type { ITocNodeDef, ITocNode, ITocModelEvents, ITocModelReadable, ITocModelWritable };
