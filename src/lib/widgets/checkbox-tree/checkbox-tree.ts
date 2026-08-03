import './tree.css';
import { treeCss, interactiveSelector } from './tree-dom.ts';
import { TreeNodeElement, createTreeNode } from './tree-node.ts';
import { CheckboxModel } from './tri-state.ts';
import type { CheckedState } from './tri-state.ts';

/**
 * Minimal shape of a build definition: a stable `id` and its `parent_id` (`null` for a root).
 * `type` (default `'label'`) decides whether the row gets a checkbox at all — independent of
 * leaf/branch. `expanded` (default `false`) sets a branch's *initial* expand state only; the tree
 * owns expansion thereafter and never re-reads it. Both are per-node and not inherited.
 */
interface ITreeDef {
  id: string;
  parent_id: string | null;
  type?: 'checkbox' | 'label';
  expanded?: boolean;
}

/**
 * Tree-level policy for checkbox **groups** (irrelevant to leaves, which always store their own
 * boolean). `'cascade'` derives a group's state from its descendant checkbox-leaves (supports
 * `mixed`) and toggling it cascades to them. `'self'` gives every checkbox node — leaf or group —
 * its own independent boolean: no aggregation, no `mixed`, no ancestor recomputation.
 */
type Checkable = 'cascade' | 'self';

/** Options for {@link CheckboxTreeElement.build}. */
interface IBuildOptions {
  checkable?: Checkable;
}

/**
 * `detail` payload of the {@link CheckboxTreeElement.events.change} event — fired only on a user
 * gesture. `checkedIds` is the full checked set after the toggle: checkbox-leaf ids in `'cascade'`
 * mode, plus checked checkbox-**group** ids too in `'self'` mode (a group has no authoritative
 * state to store in `'cascade'` mode, so it's never a member there).
 */
interface ICheckboxTreeChangeDetail {
  checkedIds: string[];
  nodeId: string;
  checked: boolean;
}

/** Maps the model's aggregate vocabulary to the ARIA `aria-checked` value it corresponds to. */
function ariaCheckedValue(state: CheckedState): 'true' | 'false' | 'mixed' {
  if (state === 'checked') return 'true';
  if (state === 'mixed') return 'mixed';
  return 'false';
}

/**
 * `<checkbox-tree>` — a labeled `role="tree"` composed from a flat array of defs, rendering an
 * accessible checkbox per {@link Checkable} mode. This task builds the **static** structure only:
 * roles, positional ARIA, a single tab stop, and checkbox rendering. No keyboard, no toggling.
 *
 * **Eager build.** Every node is materialized up front, roots down; branches start collapsed —
 * their subtree stays in the DOM (CSS hides it), never rebuilt on expand. See the checkbox-tree
 * build plan's Design decisions §4.
 */
class CheckboxTreeElement extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'checkbox-tree';

  /** Default accessible name, applied only when the consumer supplied neither `aria-label` nor `aria-labelledby`. */
  static readonly defaultLabel = 'Tree';

  /** DOM event this element dispatches. Fires (bubbling) only on a user gesture — see State ownership. */
  static readonly events = {
    change: 'checkbox-tree:change',
  } as const;

  #getLabel: ((def: ITreeDef) => string) | null = null;
  #checkable: Checkable = 'cascade';
  #model = new CheckboxModel();
  #tabStop: TreeNodeElement | null = null;

  /** Establishes tree semantics, the accessible name, and delegated interaction listeners. */
  connectedCallback(): void {
    this.setAttribute('role', 'tree');
    this.#applyAccessibleName();
    this.addEventListener('keydown', this.#onKeyDown);
    this.addEventListener('click', this.#onClick);
    this.addEventListener('focusin', this.#onFocusIn);
  }

  /** Tears down the delegated interaction listeners. */
  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('focusin', this.#onFocusIn);
  }

  /**
   * Builds the tree from a flat `defs` array. Clears any previous content. `getLabel` is called
   * once per node, at creation, to produce its row's label text.
   * @param defs - Flat node definitions; a node is a branch iff some other def names it as `parent_id`.
   * @param getLabel - Produces each row's label text from its definition.
   * @param options.checkable - `'cascade'` (default) or `'self'` — see {@link Checkable}. Governs
   *   checkbox groups only; placement itself comes from each def's own `type`.
   */
  build<T extends ITreeDef>(defs: T[], getLabel: (def: T) => string, options: IBuildOptions = {}): void {
    this.#getLabel = getLabel as (def: ITreeDef) => string;
    this.#checkable = options.checkable ?? 'cascade';
    this.#model = new CheckboxModel();
    this.replaceChildren();

    const childrenByParent = new Map<string, T[]>();
    const roots: T[] = [];
    for (const def of defs) {
      if (def.parent_id === null) { roots.push(def); continue; }
      const siblings = childrenByParent.get(def.parent_id);
      if (siblings) siblings.push(def);
      else childrenByParent.set(def.parent_id, [def]);
    }

    const buildNode = (def: T, level: number, setsize: number, posinset: number): TreeNodeElement => {
      const node = createTreeNode(this.#getLabel!(def));
      node.dataset.id = def.id;
      if (def.parent_id !== null) node.dataset.parentId = def.parent_id;
      node.dataset.type = def.type ?? 'label';
      node.setAttribute('aria-level', String(level));
      node.setAttribute('aria-setsize', String(setsize));
      node.setAttribute('aria-posinset', String(posinset));

      const childDefs = childrenByParent.get(def.id);
      node.setLeaf(!childDefs);
      if (childDefs) {
        childDefs.forEach((childDef, i) => {
          node.appendChildNode(buildNode(childDef, level + 1, childDefs.length, i + 1));
        });
        if (def.expanded === true) node.expand();
      }

      if (this.#isCheckbox(node)) this.#addCheckbox(node);
      return node;
    };

    roots.forEach((def, i) => this.appendChild(buildNode(def, 1, roots.length, i + 1)));

    this.#tabStop = null;
    this.#setTabStop(this.#firstVisibleRow());
  }

  /**
   * Current checked ids: checkbox-leaf ids in `'cascade'` mode; checkbox-leaf **and** checked
   * checkbox-group ids in `'self'` mode (a `'cascade'` group has no stored state of its own).
   */
  getChecked(): string[] {
    return this.#model.getChecked();
  }

  /**
   * Replaces the checked set and reflects every rendered row. Does **not** emit — the caller
   * already knows. Accepts the same id set {@link getChecked} returns (self-mode group ids included).
   */
  setChecked(ids: Iterable<string>): void {
    this.#model.setChecked(ids);
    for (const node of this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      this.#reflectState(node);
    }
  }

  /** Expands every rendered branch. */
  expandAll(): void {
    for (const node of this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      if (!node.isLeaf) node.expand();
    }
  }

  /** Collapses every rendered branch. */
  collapseAll(): void {
    for (const node of this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      if (!node.isLeaf) node.collapse();
    }
  }

  /**
   * Builds a node from `def` (always a leaf — it has no children yet) and inserts it under `parent`
   * at `index` (appended if omitted). `parent` omitted/null inserts a root. `def.type` (default
   * `'label'`) decides checkbox placement, same as {@link build}. If `parent` was itself a
   * checkbox-leaf, it flips to a checkbox-branch — see {@link #onParentGainedChild} for the
   * cascade/self storage-transition rule. Surgical: only the affected sibling group and `parent`'s
   * own ancestors are re-stamped/reflected.
   */
  add<T extends ITreeDef>(def: T, parent?: TreeNodeElement | string | null, index?: number): void {
    const parentNode = parent == null ? null : this.#resolve(parent);

    const node = createTreeNode(this.#getLabel!(def));
    node.dataset.id = def.id;
    if (def.parent_id !== null) node.dataset.parentId = def.parent_id;
    node.dataset.type = def.type ?? 'label';
    node.setLeaf(true);
    if (this.#isCheckbox(node)) this.#addCheckbox(node);

    this.#insertInto(parentNode, node, index);
    if (parentNode) this.#onParentGainedChild(parentNode);

    this.#restampSiblings(this.#containerOf(parentNode));
    this.#reflectNodeAndAncestors(parentNode);
    this.#repairRoving();
  }

  /**
   * Detaches `node` and its subtree, forgetting every id within it that could hold stored checked
   * state under the current policy (see {@link #storedCheckboxIds}). If that empties its parent, the
   * parent flips back to a leaf. Surgical: only the former parent's sibling group and ancestors are
   * re-stamped/reflected (only in `'cascade'` mode — see {@link #reflectAncestors}).
   */
  removeNode(node: TreeNodeElement | string): void {
    const target = this.#resolve(node);
    if (!target) return;

    this.#model.forget(this.#storedCheckboxIds(target));

    const parent = this.#parentRow(target);
    target.remove();
    if (parent && parent.childCount === 0) this.#onParentEmptied(parent);

    this.#restampSiblings(this.#containerOf(parent));
    this.#reflectNodeAndAncestors(parent);
    this.#repairRoving();
  }

  /**
   * Re-parents `node` under `newParent` at `index` (root if null/omitted), keeping its checked
   * leaves. Re-parenting a node into its own subtree throws (DOM unchanged) rather than corrupting
   * the tree. Updates leaf/branch on both the old and new parent, re-stamps both sibling groups and
   * the moved subtree's levels (depth may have changed), and reflects both parents' ancestors.
   */
  move(node: TreeNodeElement | string, newParent?: TreeNodeElement | string | null, index?: number): void {
    const target = this.#resolve(node);
    if (!target) return;
    const targetParent = newParent == null ? null : this.#resolve(newParent);
    const oldParent = this.#parentRow(target);

    this.#reparent(targetParent, target, index);

    if (this.#wasEmptiedByMove(oldParent, targetParent)) this.#onParentEmptied(oldParent);
    if (targetParent) this.#onParentGainedChild(targetParent);

    this.#restampSiblings(this.#containerOf(oldParent));
    this.#restampSiblings(this.#containerOf(targetParent));
    this.#restampLevels(target);

    this.#reflectNodeAndAncestors(oldParent);
    this.#reflectNodeAndAncestors(targetParent);
    this.#repairRoving();
  }

  /** Applies the accessible name, forwarding a consumer-supplied `aria-label`/`aria-labelledby`, else defaulting. */
  #applyAccessibleName(): void {
    if (this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby')) return;
    this.setAttribute('aria-label', CheckboxTreeElement.defaultLabel);
  }

  /**
   * Inserts the decorative, `aria-hidden` checkbox visual into `node`'s row (after the toggle,
   * before the content) and sets the row's initial `aria-checked="false"`. Called only for a
   * `type: 'checkbox'` node — leaf or group alike. A `'label'` node gets neither.
   */
  #addCheckbox(node: TreeNodeElement): void {
    const span = document.createElement('span');
    span.className = treeCss.checkbox;
    span.setAttribute('aria-hidden', 'true');
    span.dataset.state = 'unchecked';
    node.rowEl.insertBefore(span, node.contentEl);
    node.setAttribute('aria-checked', 'false');
  }

  /** Whether `node` was placed with a checkbox (`data-type === 'checkbox'`), as opposed to a plain label row. */
  #isCheckbox(node: TreeNodeElement): boolean {
    return node.type === 'checkbox';
  }

  /**
   * One row-scoped action per handled key. Keyed by {@link KeyboardEvent.key}; a handler decides
   * whether focus moves (via {@link #focusRow}) or the row itself changes state.
   */
  #keyHandlers: Record<string, (row: TreeNodeElement) => void> = {
    ArrowDown: (row) => { const next = this.#visibleSuccessor(row); if (next) this.#focusRow(next); },
    ArrowUp: (row) => { const prev = this.#visiblePredecessor(row); if (prev) this.#focusRow(prev); },
    Home: () => { const first = this.#firstVisibleRow(); if (first) this.#focusRow(first); },
    End: () => { const last = this.#lastVisibleRow(); if (last) this.#focusRow(last); },
    ArrowRight: (row) => this.#onArrowRight(row),
    ArrowLeft: (row) => this.#onArrowLeft(row),
    Enter: (row) => this.#togglePrimary(row),
    ' ': (row) => this.#togglePrimary(row),
  };

  /**
   * Delegated keyboard handler implementing the Keyboard section (Up/Down/Home/End/Left/Right/
   * Enter/Space). Ignored when the key originated inside a match for {@link interactiveSelector},
   * so injected interactive content (should a label ever carry one) keeps its native key handling.
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

  /**
   * Delegated click: a click on the toggle or content (not interactive content, not the checkbox)
   * toggles expand/collapse; a click on the checkbox visual runs the primary (toggle-checked) action.
   */
  #onClick = (ev: MouseEvent): void => {
    const target = ev.target as Element;
    const row = target.closest<TreeNodeElement>(TreeNodeElement.tagName);
    if (!row) return;
    if (target.closest(interactiveSelector)) return;
    if (target.closest(`.${treeCss.checkbox}`)) { this.#togglePrimary(row); return; }
    row.toggleExpand();
  };

  /** Syncs the roving tab stop to whatever row focus lands on (mouse click, or programmatic focus) — bookkeeping only. */
  #onFocusIn = (ev: FocusEvent): void => {
    const row = (ev.target as Element).closest<TreeNodeElement>(TreeNodeElement.tagName);
    if (row) this.#setTabStop(row);
  };

  /** Right: leaf → no-op; collapsed branch → expand (focus stays); expanded branch → focus first visible child. */
  #onArrowRight(row: TreeNodeElement): void {
    if (row.isLeaf) return;
    if (!row.expanded) { row.expand(); return; }
    const child = this.#firstVisibleChild(row);
    if (child) this.#focusRow(child);
  }

  /** Left: expanded branch → collapse (focus stays); else → focus parent (no-op at a root). */
  #onArrowLeft(row: TreeNodeElement): void {
    if (row.expanded) { row.collapse(); return; }
    const parent = this.#parentRow(row);
    if (parent) this.#focusRow(parent);
  }

  /**
   * The primary action on `node`. A `type: 'label'` node has no checkbox, so its primary action is
   * expand/collapse instead (a no-op on a label leaf) — nothing is emitted. A `type: 'checkbox'`
   * node always flips its own stored boolean; what else happens depends on {@link #checkable}:
   * cascading to descendant checkbox-leaves and reflecting ancestors happens only for a `'cascade'`
   * group, and only `'cascade'` reflects ancestors at all — `'self'` reflects just the node itself.
   * Emits {@link events.change} with the resulting `checkedIds`.
   */
  #togglePrimary(node: TreeNodeElement): void {
    if (!this.#isCheckbox(node)) {
      node.toggleExpand();
      return;
    }
    const id = node.dataset.id!;
    const cascadeGroup = this.#checkable === 'cascade' && !node.isLeaf;
    const { checked } = cascadeGroup
      ? this.#model.toggleGroup(this.#descendantCheckboxLeafIds(node))
      : this.#model.toggleOne(id);

    if (cascadeGroup) this.#reflectSubtree(node);
    else this.#reflectState(node);
    if (this.#checkable === 'cascade') this.#reflectAncestors(node);

    this.dispatchEvent(new CustomEvent<ICheckboxTreeChangeDetail>(CheckboxTreeElement.events.change, {
      detail: { checkedIds: this.#model.getChecked(), nodeId: id, checked },
      bubbles: true,
    }));
  }

  /**
   * Reflects `node`'s checkbox visual + `aria-checked` from the model. No-op if `node` has no
   * checkbox (a `type: 'label'` node). A leaf, or any node in `'self'` mode, reads its own stored
   * boolean (`true`/`false` only). A `'cascade'` group aggregates over
   * {@link #descendantCheckboxLeafIds} instead, which can yield `mixed`.
   */
  #reflectState(node: TreeNodeElement): void {
    const span = node.rowEl.querySelector<HTMLElement>(`:scope > .${treeCss.checkbox}`);
    if (!span) return;
    const id = node.dataset.id!;
    const state: CheckedState = node.isLeaf || this.#checkable === 'self'
      ? (this.#model.isChecked(id) ? 'checked' : 'unchecked')
      : this.#model.aggregate(this.#descendantCheckboxLeafIds(node));
    span.dataset.state = state;
    node.setAttribute('aria-checked', ariaCheckedValue(state));
  }

  /** Reflects `node` and every descendant row — the surgical scope after a cascade group's checked state changes. */
  #reflectSubtree(node: TreeNodeElement): void {
    this.#reflectState(node);
    const group = node.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    if (!group) return;
    for (const el of group.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) this.#reflectState(el);
  }

  /**
   * Reflects every enclosing ancestor of `node` — the surgical scope for a cascade's upward effect.
   * No-op in `'self'` mode: a self group's state never depends on its descendants, so its ancestors
   * (also self groups) never need recomputing.
   */
  #reflectAncestors(node: TreeNodeElement): void {
    if (this.#checkable === 'self') return;
    for (const ancestor of this.#enclosingNodes(node)) this.#reflectState(ancestor);
  }

  /**
   * `data-id`s of **checkbox-leaves** under `node` (any depth) — descendants that are both leaves
   * and `type: 'checkbox'`. Walks through/past `label` nodes and intermediate checkbox-groups, which
   * derive rather than store. `[]` for a leaf. Used only by cascade aggregation/cascade.
   */
  #descendantCheckboxLeafIds(node: TreeNodeElement): string[] {
    const group = node.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    if (!group) return [];
    const ids: string[] = [];
    for (const el of group.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      if (el.isLeaf && this.#isCheckbox(el) && el.dataset.id !== undefined) ids.push(el.dataset.id);
    }
    return ids;
  }

  /**
   * Ids within `node`'s own subtree (`node` included) that could currently hold stored checked
   * state, under the active policy — used to forget the right ids on removal. Checkbox-leaves
   * always store; checkbox-**groups** store too, but only in `'self'` mode (in `'cascade'` mode a
   * group derives, so it was never in the model to begin with).
   */
  #storedCheckboxIds(node: TreeNodeElement): string[] {
    const ids: string[] = [];
    const collect = (el: TreeNodeElement): void => {
      if (!this.#isCheckbox(el) || el.dataset.id === undefined) return;
      if (el.isLeaf || this.#checkable === 'self') ids.push(el.dataset.id);
    };
    collect(node);
    const group = node.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    if (group) {
      for (const el of group.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) collect(el);
    }
    return ids;
  }

  /** `node`'s ancestor rows, immediate parent first, up to (not including) the container. */
  #enclosingNodes(node: TreeNodeElement): TreeNodeElement[] {
    const ancestors: TreeNodeElement[] = [];
    let current = this.#parentRow(node);
    while (current) {
      ancestors.push(current);
      current = this.#parentRow(current);
    }
    return ancestors;
  }

  /** The row directly following `row` in **visible** tree order (O(depth)), or `null` at the end. */
  #visibleSuccessor(row: TreeNodeElement): TreeNodeElement | null {
    const child = this.#firstVisibleChild(row);
    if (child) return child;
    let current: TreeNodeElement | null = row;
    while (current) {
      const sibling = this.#nextSiblingRow(current);
      if (sibling) return sibling;
      current = this.#parentRow(current);
    }
    return null;
  }

  /** The row directly preceding `row` in **visible** tree order (O(depth)), or `null` at the start. */
  #visiblePredecessor(row: TreeNodeElement): TreeNodeElement | null {
    const sibling = this.#prevSiblingRow(row);
    if (sibling) return this.#lastVisibleDescendant(sibling);
    return this.#parentRow(row);
  }

  /** The first row in the tree, or `null` if empty. Always visible — a root has no ancestor to be collapsed. */
  #firstVisibleRow(): TreeNodeElement | null {
    return this.querySelector<TreeNodeElement>(TreeNodeElement.tagName);
  }

  /** The last row in **visible** tree order, or `null` if empty. */
  #lastVisibleRow(): TreeNodeElement | null {
    let lastRoot: TreeNodeElement | null = null;
    for (const child of this.children) if (child instanceof TreeNodeElement) lastRoot = child;
    return lastRoot ? this.#lastVisibleDescendant(lastRoot) : null;
  }

  /** Descends `row`'s last-visible-child chain to the deepest currently visible row. */
  #lastVisibleDescendant(row: TreeNodeElement): TreeNodeElement {
    let current = row;
    let child = this.#lastVisibleChild(current);
    while (child) {
      current = child;
      child = this.#lastVisibleChild(current);
    }
    return current;
  }

  /** `row`'s first child, or `null` if collapsed/leaf/childless (not visible). */
  #firstVisibleChild(row: TreeNodeElement): TreeNodeElement | null {
    if (!row.expanded) return null;
    const group = row.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    const first = group?.firstElementChild;
    return first instanceof TreeNodeElement ? first : null;
  }

  /** `row`'s last child, or `null` if collapsed/leaf/childless (not visible). */
  #lastVisibleChild(row: TreeNodeElement): TreeNodeElement | null {
    if (!row.expanded) return null;
    const group = row.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    const last = group?.lastElementChild;
    return last instanceof TreeNodeElement ? last : null;
  }

  /** `row`'s next sibling row within its group (or the root list), or `null`. */
  #nextSiblingRow(row: TreeNodeElement): TreeNodeElement | null {
    const sibling = row.nextElementSibling;
    return sibling instanceof TreeNodeElement ? sibling : null;
  }

  /** `row`'s previous sibling row within its group (or the root list), or `null`. */
  #prevSiblingRow(row: TreeNodeElement): TreeNodeElement | null {
    const sibling = row.previousElementSibling;
    return sibling instanceof TreeNodeElement ? sibling : null;
  }

  /** `row`'s owning `<checkbox-tree-node>` (through its child group), or `null` for a root. */
  #parentRow(row: TreeNodeElement): TreeNodeElement | null {
    const parent = row.parentElement;
    if (!parent || !parent.classList.contains(treeCss.group)) return null;
    const owner = parent.parentElement;
    return owner instanceof TreeNodeElement ? owner : null;
  }

  /** Moves the roving tab stop to `row` and moves DOM focus to it (keyboard moves are synchronous — focus can't be async). */
  #focusRow(row: TreeNodeElement): void {
    this.#setTabStop(row);
    row.focus();
  }

  /** Moves the single `tabindex=0` from the previous tab stop to `node`. */
  #setTabStop(node: TreeNodeElement | null): void {
    if (this.#tabStop === node) return;
    if (this.#tabStop) this.#tabStop.tabIndex = -1;
    this.#tabStop = node;
    if (node) node.tabIndex = 0;
  }

  /**
   * Resolves a node argument to its element: passed through as-is, or looked up by `data-id` with a
   * one-off scoped `querySelector`. The **only** id→element lookup site — never a maintained registry.
   */
  #resolve(nodeOrId: TreeNodeElement | string): TreeNodeElement | null {
    if (typeof nodeOrId !== 'string') return nodeOrId;
    return this.querySelector<TreeNodeElement>(`[data-id="${CSS.escape(nodeOrId)}"]`);
  }

  /**
   * Inserts `node` under `parentNode` (root if `null`) at `index` (appended if omitted).
   * `parentNode.appendChildNode` guarantees its group exists and `node` is attached before any
   * repositioning, so a specific `index` is honored by a single follow-up `insertBefore`.
   */
  #insertInto(parentNode: TreeNodeElement | null, node: TreeNodeElement, index?: number): void {
    if (parentNode) parentNode.appendChildNode(node);
    else this.appendChild(node);

    if (index === undefined) return;
    const container = this.#containerOf(parentNode);
    const siblings = this.#directNodes(container).filter((n) => n !== node);
    const ref = siblings[index];
    if (ref) container.insertBefore(node, ref);
  }

  /** The container `parentNode`'s children are inserted into: its group, or the tree root when `null`. */
  #containerOf(parentNode: TreeNodeElement | null): Element {
    return parentNode ? parentNode.querySelector<HTMLElement>(`:scope > .${treeCss.group}`)! : this;
  }

  /**
   * Re-parents `node` under `targetParent` (root if `null`) at `index`, translating the native
   * cycle-detection error (`HierarchyRequestError`, thrown when `targetParent` is inside `node`'s
   * own subtree) into a clear message. DOM is unchanged on throw — the native check runs before any
   * mutation.
   */
  #reparent(targetParent: TreeNodeElement | null, node: TreeNodeElement, index?: number): void {
    try {
      this.#insertInto(targetParent, node, index);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'HierarchyRequestError') {
        throw new Error('move: cannot move a node into its own subtree');
      }
      throw err;
    }
  }

  /** Whether `oldParent` lost its only child to a move away from it (a same-parent reorder doesn't count). */
  #wasEmptiedByMove(oldParent: TreeNodeElement | null, targetParent: TreeNodeElement | null): oldParent is TreeNodeElement {
    return oldParent !== null && oldParent !== targetParent && oldParent.childCount === 0;
  }

  /**
   * A parent that just lost its last child flips back to a leaf. Checkbox presence never changes
   * (driven by `type`, fixed at creation). A checkbox-branch→leaf transition needs no explicit
   * storage fix-up either way: in `'cascade'` mode it simply becomes an unchecked stored leaf (it
   * was never stored as a group, so there's nothing to carry over); in `'self'` mode it already had
   * its own stored boolean as a group and keeps it unchanged.
   */
  #onParentEmptied(parent: TreeNodeElement): void {
    parent.setLeaf(true);
  }

  /**
   * A leaf parent that just gained a child flips to a branch. Checkbox presence is unaffected, but
   * a checkbox-leaf→branch transition in `'cascade'` mode must forget its stored id — it now derives
   * from descendants instead. `'self'` mode keeps the stored boolean unchanged (a group stores its
   * own state too, so nothing to forget).
   */
  #onParentGainedChild(parent: TreeNodeElement): void {
    if (!parent.isLeaf) return;
    parent.setLeaf(false);
    if (this.#checkable === 'cascade' && this.#isCheckbox(parent) && parent.dataset.id !== undefined) {
      this.#model.forget([parent.dataset.id]);
    }
  }

  /** Reflects `node` itself and its ancestors — the surgical scope for a structural mutation's checkbox effects. No-op for `null`. */
  #reflectNodeAndAncestors(node: TreeNodeElement | null): void {
    if (!node) return;
    this.#reflectState(node);
    this.#reflectAncestors(node);
  }

  /** Re-stamps `aria-level`/`aria-setsize`/`aria-posinset` for the direct rows of `container` (a group or the tree root). */
  #restampSiblings(container: Element): void {
    const level = this.#levelFor(container);
    const nodes = this.#directNodes(container);
    const setsize = String(nodes.length);
    nodes.forEach((node, i) => {
      node.setAttribute('aria-level', String(level));
      node.setAttribute('aria-setsize', setsize);
      node.setAttribute('aria-posinset', String(i + 1));
    });
  }

  /** The `aria-level` `container`'s direct rows get: one more than the number of `<checkbox-tree-node>` ancestors it has. */
  #levelFor(container: Element): number {
    if (container === this) return 1;
    let level = 1;
    for (let el: Element | null = container.parentElement; el && el !== this; el = el.parentElement) {
      if (el instanceof TreeNodeElement) level++;
    }
    return level;
  }

  /** Re-stamps `aria-level` throughout `node`'s subtree from its own (already-correct) level — a moved subtree's descendants re-level. */
  #restampLevels(node: TreeNodeElement): void {
    const level = Number(node.getAttribute('aria-level') ?? '1');
    this.#restampLevelsFrom(node, level);
  }

  #restampLevelsFrom(node: TreeNodeElement, level: number): void {
    const group = node.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    if (!group) return;
    for (const child of this.#directNodes(group)) {
      child.setAttribute('aria-level', String(level + 1));
      this.#restampLevelsFrom(child, level + 1);
    }
  }

  /** Direct `<checkbox-tree-node>` children of `container` (a group or the tree root). */
  #directNodes(container: Element): TreeNodeElement[] {
    const nodes: TreeNodeElement[] = [];
    for (const child of container.children) if (child instanceof TreeNodeElement) nodes.push(child);
    return nodes;
  }

  /** Ensures exactly one visible row is the tab stop; reassigns (and moves focus, if it was focused) when the current one detached. */
  #repairRoving(): void {
    if (this.#tabStop && this.contains(this.#tabStop)) return;
    const wasFocused = this.#tabStop !== null && document.activeElement === this.#tabStop;
    this.#tabStop = null;
    const next = this.#firstVisibleRow();
    this.#setTabStop(next);
    if (wasFocused && next) next.focus();
  }
}

if (!customElements.get(CheckboxTreeElement.tagName)) {
  customElements.define(CheckboxTreeElement.tagName, CheckboxTreeElement);
}

export { CheckboxTreeElement };
export type { ITreeDef, Checkable, IBuildOptions, ICheckboxTreeChangeDetail };
