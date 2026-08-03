import './tree.css';
import { treeCss, interactiveSelector } from './tree-dom.ts';
import { TreeNodeElement, createTreeNode } from './tree-node.ts';
import { CheckboxModel } from './tri-state.ts';
import type { CheckedState } from './tri-state.ts';

/** Minimal shape of a build definition: a stable `id` and its `parent_id` (`null` for a root). */
interface ITreeDef {
  id: string;
  parent_id: string | null;
}

/** Whether every row gets a checkbox (`'all'`, tri-state) or only leaves do (`'leaves'`, no cascade). */
type Checkable = 'all' | 'leaves';

/** Options for {@link CheckboxTreeElement.build}. */
interface IBuildOptions {
  checkable?: Checkable;
}

/** `detail` payload of the {@link CheckboxTreeElement.events.change} event — fired only on a user gesture. */
interface ICheckboxTreeChangeDetail {
  checkedLeafIds: string[];
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
  #checkable: Checkable = 'all';
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
   * @param options.checkable - `'all'` (default) renders a checkbox on every row; `'leaves'` only on leaves.
   */
  build<T extends ITreeDef>(defs: T[], getLabel: (def: T) => string, options: IBuildOptions = {}): void {
    this.#getLabel = getLabel as (def: ITreeDef) => string;
    this.#checkable = options.checkable ?? 'all';
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
      node.setAttribute('aria-level', String(level));
      node.setAttribute('aria-setsize', String(setsize));
      node.setAttribute('aria-posinset', String(posinset));

      const childDefs = childrenByParent.get(def.id);
      node.setLeaf(!childDefs);
      if (childDefs) {
        childDefs.forEach((childDef, i) => {
          node.appendChildNode(buildNode(childDef, level + 1, childDefs.length, i + 1));
        });
      }

      const wantsCheckbox = this.#checkable === 'all' || !childDefs;
      if (wantsCheckbox) this.#addCheckbox(node);
      return node;
    };

    roots.forEach((def, i) => this.appendChild(buildNode(def, 1, roots.length, i + 1)));

    this.#tabStop = null;
    this.#setTabStop(this.#firstVisibleRow());
  }

  /** Current checked leaf ids. */
  getChecked(): string[] {
    return this.#model.getChecked();
  }

  /** Replaces the checked set and reflects every rendered row. Does **not** emit — the caller already knows. */
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

  /** Applies the accessible name, forwarding a consumer-supplied `aria-label`/`aria-labelledby`, else defaulting. */
  #applyAccessibleName(): void {
    if (this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby')) return;
    this.setAttribute('aria-label', CheckboxTreeElement.defaultLabel);
  }

  /**
   * Inserts the decorative, `aria-hidden` checkbox visual into `node`'s row (after the toggle,
   * before the content) and sets the row's initial `aria-checked="false"`. Called only when the
   * mode calls for a checkbox on this node — a `'leaves'`-mode group gets neither.
   */
  #addCheckbox(node: TreeNodeElement): void {
    const span = document.createElement('span');
    span.className = treeCss.checkbox;
    span.setAttribute('aria-hidden', 'true');
    span.dataset.state = 'unchecked';
    node.rowEl.insertBefore(span, node.contentEl);
    node.setAttribute('aria-checked', 'false');
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
   * The primary action on `node`: toggles checked state (leaf flips itself; group cascades to its
   * descendant leaves), reflects the affected subtree and ancestors, and emits
   * {@link events.change}. In `'leaves'` mode a group has no checkbox, so its primary action is
   * expand/collapse instead — and nothing is emitted.
   */
  #togglePrimary(node: TreeNodeElement): void {
    if (this.#checkable === 'leaves' && !node.isLeaf) {
      node.toggleExpand();
      return;
    }
    const id = node.dataset.id!;
    const { checked } = node.isLeaf
      ? this.#model.toggleLeaf(id)
      : this.#model.toggleGroup(this.#descendantLeafIds(node));
    this.#reflectSubtree(node);
    this.#reflectAncestors(node);
    this.dispatchEvent(new CustomEvent<ICheckboxTreeChangeDetail>(CheckboxTreeElement.events.change, {
      detail: { checkedLeafIds: this.#model.getChecked(), nodeId: id, checked },
      bubbles: true,
    }));
  }

  /**
   * Reflects `node`'s checkbox visual + `aria-checked` from the model. A leaf reads its own checked
   * state; a group aggregates over {@link #descendantLeafIds}. No-op if `node` has no checkbox
   * (a `'leaves'`-mode group).
   */
  #reflectState(node: TreeNodeElement): void {
    const span = node.rowEl.querySelector<HTMLElement>(`:scope > .${treeCss.checkbox}`);
    if (!span) return;
    const id = node.dataset.id!;
    const state: CheckedState = node.isLeaf
      ? (this.#model.isChecked(id) ? 'checked' : 'unchecked')
      : this.#model.aggregate(this.#descendantLeafIds(node));
    span.dataset.state = state;
    node.setAttribute('aria-checked', ariaCheckedValue(state));
  }

  /** Reflects `node` and every descendant row — the surgical scope after a group's checked state changes. */
  #reflectSubtree(node: TreeNodeElement): void {
    this.#reflectState(node);
    const group = node.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    if (!group) return;
    for (const el of group.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) this.#reflectState(el);
  }

  /** Reflects every enclosing ancestor of `node` — the surgical scope for a cascade's upward effect. */
  #reflectAncestors(node: TreeNodeElement): void {
    for (const ancestor of this.#enclosingNodes(node)) this.#reflectState(ancestor);
  }

  /** Leaf `data-id`s under `node` (any depth), found by a scoped walk of its group. `[]` for a leaf. */
  #descendantLeafIds(node: TreeNodeElement): string[] {
    const group = node.querySelector<HTMLElement>(`:scope > .${treeCss.group}`);
    if (!group) return [];
    const ids: string[] = [];
    for (const el of group.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      if (el.isLeaf && el.dataset.id !== undefined) ids.push(el.dataset.id);
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

  /** `row`'s owning `<tree-node>` (through its child group), or `null` for a root. */
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
}

if (!customElements.get(CheckboxTreeElement.tagName)) {
  customElements.define(CheckboxTreeElement.tagName, CheckboxTreeElement);
}

export { CheckboxTreeElement };
export type { ITreeDef, Checkable, IBuildOptions, ICheckboxTreeChangeDetail };
