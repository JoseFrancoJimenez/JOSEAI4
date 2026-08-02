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

export type { ITocNodeDef, ITocNode, ITocModelEvents };