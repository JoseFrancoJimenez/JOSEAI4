import Evented from '../../core/evented.ts';
import type { ITocNodeDef, ITocNode, ITocModelEvents } from './toc.types.ts';

class TocNode implements ITocNode {
  readonly id: string;
  readonly type: string;
  parent: TocNode | null; // intentionally mutable — TocModel owns all writes; ITocNode exposes it as readonly
  readonly children: TocNode[];
  depth: number;

  constructor(id: string, type: string, parent: TocNode | null, depth: number) {
    this.id = id;
    this.type = type;
    this.parent = parent;
    this.children = [];
    this.depth = depth;
  }
}

/**
 * Builds and manages a TOC tree from a flat node definition array.
 * Input order is not required to be sorted — parent_id references are resolved in a second pass.
 *
 * Extends {@link Evented} — subscribe to `'change'`, `'add'`, `'remove'`, or `'move'`.
 *
 * ```ts
 * const model = new TocModel(defs);
 * model.on('change', () => render());
 * model.add({ id: 'NewLayer', parent_id: null, type: 'layer' });
 * model.move('Census2021CMA', 'SAM');
 * model.remove('CIMD');
 * ```
 */
class TocModel extends Evented<ITocModelEvents> {
  readonly #nodes: Map<string, TocNode> = new Map();
  readonly #roots: TocNode[] = [];

  constructor(defs: ITocNodeDef[]) {
    super();
    this.#buildFromDefs(defs);
  }

  /** Top-level nodes (depth 0). */
  get roots(): readonly ITocNode[] {
    return this.#roots;
  }

  /** Total number of nodes in the tree. */
  get size(): number {
    return this.#nodes.size;
  }

  /** Returns the node for `id`, or `undefined` if not found. */
  get(id: string): ITocNode | undefined {
    return this.#nodes.get(id);
  }

  /**
   * Adds a new node.
   * Throws if the id already exists or `parent_id` is not found.
   */
  add(def: ITocNodeDef): void {
    if (this.#nodes.has(def.id)) throw new Error(`TocModel: node "${def.id}" already exists`);
    if (def.parent_id !== null && !this.#nodes.has(def.parent_id)) {
      throw new Error(`TocModel: parent "${def.parent_id}" not found`);
    }
    const parent = def.parent_id !== null ? this.#nodes.get(def.parent_id)! : null;
    const node = new TocNode(def.id, def.type, parent, parent ? parent.depth + 1 : 0);
    this.#nodes.set(node.id, node);
    if (parent) parent.children.push(node);
    else this.#roots.push(node);
    this.emit('add', { node });
    this.emit('change', {});
  }

  /**
   * Removes a node and its entire subtree.
   * Throws if the id is not found.
   */
  remove(id: string): void {
    const node = this.#getNode(id);
    this.#detach(node);
    this.#pruneRegistry(node);
    this.emit('remove', { node });
    this.emit('change', {});
  }

  /**
   * Moves a node under `newParentId`, or to the top level when `newParentId` is `null`.
   * Throws if the move would create a cycle.
   */
  move(id: string, newParentId: string | null): void {
    const node = this.#getNode(id);
    const newParent = newParentId !== null ? this.#getNode(newParentId) : null;

    let ancestor: TocNode | null = newParent;
    while (ancestor !== null) {
      if (ancestor === node) throw new Error(`TocModel: cannot move "${id}" into its own subtree`);
      ancestor = ancestor.parent;
    }

    const previousParent = node.parent;
    this.#detach(node);
    node.parent = newParent;
    this.#assignDepths(node, newParent ? newParent.depth + 1 : 0);
    // always appends — no position control; extend the signature if sibling order matters
    if (newParent) newParent.children.push(node);
    else this.#roots.push(node);
    this.emit('move', { node, previousParent });
    this.emit('change', {});
  }

  /** Removes all nodes. */
  clear(): void {
    this.#roots.length = 0;
    this.#nodes.clear();
    this.emit('clear', {});
    this.emit('change', {});
  }

  /** Iterates all nodes in depth-first order. */
  *[Symbol.iterator](): IterableIterator<ITocNode> {
    for (const root of this.#roots) yield* this.#walk(root);
  }

  #buildFromDefs(defs: ITocNodeDef[]): void {
    // Pass 1: instantiate every node (no wiring yet — order may be arbitrary)
    for (const def of defs) {
      if (this.#nodes.has(def.id)) throw new Error(`TocModel: duplicate id "${def.id}"`);
      this.#nodes.set(def.id, new TocNode(def.id, def.type, null, 0));
    }

    // Pass 2: wire parent-child relationships
    for (const def of defs) {
      const node = this.#nodes.get(def.id)!;
      if (def.parent_id === null) {
        this.#roots.push(node);
      } else {
        const parent = this.#nodes.get(def.parent_id);
        if (!parent) throw new Error(`TocModel: parent "${def.parent_id}" not found for "${def.id}"`);
        node.parent = parent;
        parent.children.push(node);
      }
    }

    // Pass 3: compute depths top-down so order of input does not matter
    for (const root of this.#roots) this.#assignDepths(root, 0);
  }

  #getNode(id: string): TocNode {
    const node = this.#nodes.get(id);
    if (!node) throw new Error(`TocModel: node "${id}" not found`);
    return node;
  }

  #detach(node: TocNode): void {
    const container = node.parent ? node.parent.children : this.#roots;
    const idx = container.indexOf(node);
    if (idx !== -1) container.splice(idx, 1);
  }

  #pruneRegistry(root: TocNode): void {
    const stack: TocNode[] = [root];
    while (stack.length) {
      const node = stack.pop()!;
      this.#nodes.delete(node.id);
      stack.push(...node.children);
    }
  }

  #assignDepths(node: TocNode, depth: number): void {
    node.depth = depth;
    for (const child of node.children) this.#assignDepths(child, depth + 1);
  }

  *#walk(node: TocNode): IterableIterator<TocNode> {
    yield node;
    for (const child of node.children) yield* this.#walk(child);
  }
}

export { TocModel };