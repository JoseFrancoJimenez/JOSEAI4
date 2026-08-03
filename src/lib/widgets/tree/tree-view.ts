import './tree.css';
import { treeCss, interactiveSelector } from './tree-dom.ts';
import { TreeNodeElement, createTreeNode } from './tree-node.ts';

/**
 * Minimal shape of a build definition: a stable `id` and its `parent_id` (`null` for a root).
 * {@link TreeViewElement.build} is generic over any `T` extending this, so a consumer's own
 * richer node type flows through to its `renderNode` callback unchanged.
 */
interface ITreeNodeDef {
  id: string;
  parent_id: string | null;
  /**
   * Optional initial expansion hint, honored the moment the node is materialized (at build for a root,
   * or when its parent first opens for a deeper node). **Ignored on a leaf** — a node with no children
   * in the recipe cannot expand. Applied silently: it does not emit `tree-node:toggle` (it is setup, not
   * a user action). It is an initial condition consumed once, never a live source of truth.
   */
  expanded?: boolean;
}

/**
 * Container element (`role="tree"`) that composes {@link TreeNodeElement} rows from a flat
 * definition array into an accessible WAI-ARIA *Tree View*.
 *
 * **The DOM is the source of truth** for what exists; there is no mutable model and no id→element
 * index. The one retained structural description is the **immutable build recipe** — a
 * `parentId → childDefs` map plus the `renderNode` callback — consulted *once per node* to
 * materialize its direct children the first time it expands, then never mutated. Everything else
 * is a surgical DOM edit; the tree is never re-rendered.
 *
 * Two concerns are kept correct by a single {@link MutationObserver} on this element:
 * - **Positional ARIA** (`aria-level`/`aria-setsize`/`aria-posinset`) — re-stamped region-scoped
 *   and batched, so a burst of sibling insertions costs O(n), not O(n²).
 * - **Roving tabindex** — exactly one rendered row carries `tabindex=0`; the observer self-heals
 *   the invariant when the active row is detached by any means (including raw DOM ops).
 *
 * ARIA stamping is intentionally asynchronous (observer microtask) — screen readers never observe
 * the gap; tests flush a tick before asserting on it. Lazy child-building, by contrast, is
 * synchronous inside the toggle handler so `expandAll` and keyboard navigation see children at once.
 */
class TreeViewElement extends HTMLElement {
  /** Custom element tag name. Use with `document.createElement` or as an HTML tag. */
  static readonly tagName = 'tree-view';

  /** Default accessible name, applied only when the consumer supplied neither `aria-label` nor `aria-labelledby`. */
  static readonly defaultLabel = 'Tree';

  #childrenByParent = new Map<string, ITreeNodeDef[]>();
  #renderNode: ((def: ITreeNodeDef) => HTMLElement) | null = null;
  #observer: MutationObserver | null = null;
  #tabStop: TreeNodeElement | null = null;

  /** Establishes tree semantics, the accessible name, and the ARIA/roving observer; stamps any pre-existing rows. */
  connectedCallback(): void {
    this.setAttribute('role', 'tree');
    this.#applyAccessibleName();
    this.addEventListener(TreeNodeElement.events.toggle, this.#onNodeToggle);
    this.addEventListener('keydown', this.#onKeyDown);
    this.addEventListener('focusin', this.#onFocusIn);
    this.#startObserver();
    this.#stampFrom(this, 1); // covers a build() that ran before connection (roots already present)
    this.#ensureRovingTabStop();
  }

  /** Tears down the observer and the toggle/keyboard/focus listeners. */
  disconnectedCallback(): void {
    this.removeEventListener(TreeNodeElement.events.toggle, this.#onNodeToggle);
    this.removeEventListener('keydown', this.#onKeyDown);
    this.removeEventListener('focusin', this.#onFocusIn);
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /**
   * Builds the tree from a flat `defs` array, retaining it as the immutable build recipe.
   * Only **root** rows are created now; every node's direct children are materialized lazily on
   * its first expand. `renderNode` is called once per node, when that node is created.
   * @param defs - Flat node definitions; a node is a branch iff some other def names it as `parent_id`.
   * @param renderNode - Produces each row's content element from its definition.
   */
  build<T extends ITreeNodeDef>(defs: T[], renderNode: (def: T) => HTMLElement): void {
    this.#renderNode = renderNode as (def: ITreeNodeDef) => HTMLElement;
    this.#childrenByParent = new Map();
    const roots: ITreeNodeDef[] = [];
    for (const def of defs) {
      if (def.parent_id === null) { roots.push(def); continue; }
      const siblings = this.#childrenByParent.get(def.parent_id);
      if (siblings) siblings.push(def);
      else this.#childrenByParent.set(def.parent_id, [def]);
    }
    this.replaceChildren();
    for (const def of roots) {
      const node = this.#createNode(def);
      this.append(node);
      this.#applyInitialExpansion(node, def);
    }
    this.#ensureRovingTabStop();
  }

  /** Expands every rendered branch, repeating until none remain collapsed (each expand builds the next level synchronously). */
  expandAll(): void {
    let expandedAny = true;
    while (expandedAny) {
      expandedAny = false;
      for (const node of this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
        if (!node.isLeaf && !node.expanded) { node.expand(); expandedAny = true; }
      }
    }
  }

  /** Collapses every rendered branch (child groups are retained for a later re-expand). */
  collapseAll(): void {
    for (const node of this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      if (node.expanded) node.collapse();
    }
  }

  /** Applies the accessible name, forwarding a consumer-supplied `aria-label`/`aria-labelledby`, else defaulting. */
  #applyAccessibleName(): void {
    if (this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby')) return;
    this.setAttribute('aria-label', TreeViewElement.defaultLabel);
  }

  /**
   * Creates a `<tree-node>` from a definition: renders its content, stamps the load-bearing
   * `data-id` (read back on expand to look up children) and courtesy `data-parent-id`, and sets
   * leaf/branch from whether the node appears as a parent in the recipe.
   */
  #createNode(def: ITreeNodeDef): TreeNodeElement {
    const node = createTreeNode(this.#renderNode!(def));
    node.dataset.id = def.id;
    if (def.parent_id !== null) node.dataset.parentId = def.parent_id;
    node.setLeaf(!this.#childrenByParent.has(def.id));
    return node;
  }

  /** Lazy fill on a user/programmatic expand (the emitting path). Collapse is a no-op here. */
  #onNodeToggle = (ev: Event): void => {
    const node = ev.target;
    if (node instanceof TreeNodeElement && node.expanded) this.#fillChildren(node);
  };

  /**
   * Builds a node's **direct** children from the recipe into its attached group — the single fill path,
   * shared by the emitting toggle handler and the silent initial-expansion cascade. Runs at most once per
   * node (a non-empty group means children are retained from a prior expand and are never rebuilt). Each
   * new child's own {@link ITreeNodeDef.expanded} hint is honored immediately, recursing one level deeper.
   */
  #fillChildren(node: TreeNodeElement): void {
    if (node.childCount > 0) return;
    const id = node.dataset.id;
    const childDefs = id === undefined ? undefined : this.#childrenByParent.get(id);
    if (!childDefs) return;
    for (const def of childDefs) {
      const child = this.#createNode(def);
      node.appendChildNode(child);
      this.#applyInitialExpansion(child, def);
    }
  }

  /**
   * Honors a def's initial `expanded` hint the moment its node is materialized: a branch is expanded
   * **silently** ({@link TreeNodeElement.expandSilently} — no `toggle`, this is setup not interaction) and
   * its children are built at once, which recurses through any deeper expanded descendants. A leaf's hint
   * is ignored (`isLeaf` guard) — nothing to expand.
   */
  #applyInitialExpansion(node: TreeNodeElement, def: ITreeNodeDef): void {
    if (!def.expanded || node.isLeaf) return;
    node.expandSilently();
    this.#fillChildren(node);
  }

  /**
   * One row-scoped action per handled key. Keyed by {@link KeyboardEvent.key}; a handler decides
   * whether focus moves (calling {@link TreeViewElement.#focusRow}) or the row itself changes state.
   */
  #keyHandlers: Record<string, (row: TreeNodeElement) => void> = {
    ArrowDown: (row) => { const next = this.#nextRow(row); if (next) this.#focusRow(next); },
    ArrowUp: (row) => { const prev = this.#prevRow(row); if (prev) this.#focusRow(prev); },
    Home: () => { const first = this.querySelector<TreeNodeElement>(TreeNodeElement.tagName); if (first) this.#focusRow(first); },
    End: () => {
      const rows = this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName);
      const last = rows[rows.length - 1];
      if (last) this.#focusRow(last);
    },
    ArrowRight: (row) => this.#onArrowRight(row),
    ArrowLeft: (row) => this.#onArrowLeft(row),
    Enter: (row) => row.toggle(),
    ' ': (row) => row.toggle(),
  };

  /**
   * Delegated keyboard handler implementing WAI-ARIA APG tree navigation (Up/Down/Home/End/Left/Right/
   * Enter/Space) via {@link #keyHandlers}. Ignored when the key originated inside consumer interactive
   * content, so injected controls (inputs, buttons, links) keep their native key handling.
   */
  #onKeyDown = (ev: KeyboardEvent): void => {
    const target = ev.target as Element;
    const row = target.closest<TreeNodeElement>(TreeNodeElement.tagName);
    if (!row) return;
    if (target.closest(interactiveSelector)) return;
    const handler = this.#keyHandlers[ev.key];
    if (!handler) return;
    handler(row);
    ev.preventDefault();
  };

  /** Right: leaf → no-op; collapsed branch → expand (focus stays); expanded branch → focus first child. */
  #onArrowRight(row: TreeNodeElement): void {
    if (row.isLeaf) return;
    if (!row.expanded) { row.expand(); return; }
    const child = this.#firstChildRow(row);
    if (child) this.#focusRow(child);
  }

  /** Left: expanded branch → collapse (focus stays); else → focus parent (no-op at a root). */
  #onArrowLeft(row: TreeNodeElement): void {
    if (row.expanded) { row.collapse(); return; }
    const parent = this.#parentRow(row);
    if (parent) this.#focusRow(parent);
  }

  /** Syncs the roving tab stop to whatever row focus lands on (mouse click, or focus into a row's content) — bookkeeping only. */
  #onFocusIn = (ev: FocusEvent): void => {
    const row = (ev.target as Element).closest<TreeNodeElement>(TreeNodeElement.tagName);
    if (row) this.#setTabStop(row);
  };

  /** Moves the roving tab stop to `row` and moves DOM focus to it (keyboard moves are synchronous — focus can't be async). */
  #focusRow(row: TreeNodeElement): void {
    this.#setTabStop(row);
    row.focus();
  }

  /** The rendered row directly following `row` in tree order: its first rendered child, else the next row found by ascending. */
  #nextRow(row: TreeNodeElement): TreeNodeElement | null {
    const child = this.#firstChildRow(row);
    if (child) return child;
    let current: TreeNodeElement | null = row;
    while (current) {
      const sibling = this.#nextSiblingRow(current);
      if (sibling) return sibling;
      current = this.#parentRow(current);
    }
    return null;
  }

  /** The rendered row directly preceding `row` in tree order: its previous sibling's deepest visible descendant, else its parent. */
  #prevRow(row: TreeNodeElement): TreeNodeElement | null {
    const sibling = this.#prevSiblingRow(row);
    if (sibling) return this.#lastVisibleDescendant(sibling);
    return this.#parentRow(row);
  }

  /** Descends `row`'s last-child chain to the deepest currently-rendered row. */
  #lastVisibleDescendant(row: TreeNodeElement): TreeNodeElement {
    let current = row;
    let child = this.#lastChildRow(current);
    while (child) {
      current = child;
      child = this.#lastChildRow(current);
    }
    return current;
  }

  /** `row`'s first rendered child, or `null` if collapsed/leaf/childless. */
  #firstChildRow(row: TreeNodeElement): TreeNodeElement | null {
    if (!row.expanded) return null;
    const group = row.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    const first = group?.firstElementChild;
    return first instanceof TreeNodeElement ? first : null;
  }

  /** `row`'s last rendered child, or `null` if collapsed/leaf/childless. */
  #lastChildRow(row: TreeNodeElement): TreeNodeElement | null {
    if (!row.expanded) return null;
    const group = row.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    const last = group?.lastElementChild;
    return last instanceof TreeNodeElement ? last : null;
  }

  /** `row`'s next rendered sibling within its group (or the root list), or `null`. */
  #nextSiblingRow(row: TreeNodeElement): TreeNodeElement | null {
    const sibling = row.nextElementSibling;
    return sibling instanceof TreeNodeElement ? sibling : null;
  }

  /** `row`'s previous rendered sibling within its group (or the root list), or `null`. */
  #prevSiblingRow(row: TreeNodeElement): TreeNodeElement | null {
    const sibling = row.previousElementSibling;
    return sibling instanceof TreeNodeElement ? sibling : null;
  }

  /** `row`'s owning `<tree-node>` (through its child group), or `null` for a root. */
  #parentRow(row: TreeNodeElement): TreeNodeElement | null {
    const parent = row.parentElement;
    if (!parent || !parent.classList.contains(treeCss.group)) return null;
    const owner = parent.parentElement;
    return owner instanceof TreeNodeElement ? owner : null;
  }

  /** Starts the single observer that keeps positional ARIA and the roving invariant correct. */
  #startObserver(): void {
    if (this.#observer) return;
    this.#observer = new MutationObserver((records) => this.#onMutations(records));
    this.#observer.observe(this, { childList: true, subtree: true });
  }

  /** Re-stamps only the sibling groups that gained or lost rows (batched, topmost-first), then heals roving. */
  #onMutations(records: MutationRecord[]): void {
    const containers = new Set<Element>();
    for (const record of records) {
      if (record.type === 'childList' && this.#hasNodeChange(record)) containers.add(record.target as Element);
    }
    for (const container of this.#topmost(containers)) this.#stampFrom(container, this.#childLevel(container));
    this.#ensureRovingTabStop();
  }

  /** Whether a mutation added or removed a `<tree-node>` directly (group attach/detach on its own does not shift ARIA). */
  #hasNodeChange(record: MutationRecord): boolean {
    for (const n of record.addedNodes) if (n instanceof TreeNodeElement) return true;
    for (const n of record.removedNodes) if (n instanceof TreeNodeElement) return true;
    return false;
  }

  /** Keeps only containers with no ancestor container in the set — a `#stampFrom` recursion already covers descendants. */
  #topmost(containers: Set<Element>): Element[] {
    return [...containers].filter((c) => {
      for (const other of containers) if (other !== c && other.contains(c)) return false;
      return true;
    });
  }

  /**
   * Stamps `aria-level`/`aria-setsize`/`aria-posinset` on `container`'s direct rows (`level` for
   * all of them; `setsize` their count; `posinset` their 1-based order), recursing into each row's
   * child group so a moved subtree's descendants re-level. Cost is O(rows in the stamped region).
   */
  #stampFrom(container: Element, level: number): void {
    const nodes = this.#directNodes(container);
    const setsize = String(nodes.length);
    nodes.forEach((node, i) => {
      node.setAttribute('aria-level', String(level));
      node.setAttribute('aria-setsize', setsize);
      node.setAttribute('aria-posinset', String(i + 1));
      const group = node.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
      if (group) this.#stampFrom(group, level + 1);
    });
  }

  /** Direct `<tree-node>` children of a container (a group or the tree root). */
  #directNodes(container: Element): TreeNodeElement[] {
    const nodes: TreeNodeElement[] = [];
    for (const child of container.children) if (child instanceof TreeNodeElement) nodes.push(child);
    return nodes;
  }

  /** The `aria-level` a container's direct rows get: one more than the number of `<tree-node>` ancestors it has. */
  #childLevel(container: Element): number {
    let level = 1;
    for (let el = container.parentElement; el && el !== this; el = el.parentElement) {
      if (el instanceof TreeNodeElement) level++;
    }
    return level;
  }

  /** Ensures exactly one rendered row is the tab stop; reassigns to the first row when the current one is gone. */
  #ensureRovingTabStop(): void {
    if (this.#tabStop && this.contains(this.#tabStop)) return;
    this.#setTabStop(this.querySelector<TreeNodeElement>(TreeNodeElement.tagName));
  }

  /** Moves the single `tabindex=0` from the previous tab stop to `node`. */
  #setTabStop(node: TreeNodeElement | null): void {
    if (this.#tabStop === node) return;
    if (this.#tabStop) this.#tabStop.tabIndex = -1;
    this.#tabStop = node;
    if (node) node.tabIndex = 0;
  }
}

if (!customElements.get(TreeViewElement.tagName)) {
  customElements.define(TreeViewElement.tagName, TreeViewElement);
}

export { TreeViewElement };
export type { ITreeNodeDef };
