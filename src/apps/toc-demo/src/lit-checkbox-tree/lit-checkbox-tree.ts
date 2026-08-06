import { LitElement, html, css, nothing } from "lit";
import type { TemplateResult } from "lit";
import type {
  ICheckboxTreeNodeDef as ITreeDef,
  CheckboxTreeCheckable as Checkable,
  ICheckboxTreeBuildOptions as IBuildOptions,
  ICheckboxTreeChangeDetail,
} from "@mini/lib/widgets";
import { CheckboxModel } from "./checkbox-model.ts";
import type { CheckedState } from "./checkbox-model.ts";

/** Internal, flat representation of one row — the Lit analog of the vanilla widget's `<checkbox-tree-node>` element. */
interface INode {
  id: string;
  parentId: string | null;
  type: "checkbox" | "label";
  label: string;
  isLeaf: boolean;
  expanded: boolean;
  children: string[];
}

/** Maps the model's aggregate vocabulary to the ARIA `aria-checked` value it corresponds to. */
function ariaCheckedValue(state: CheckedState): "true" | "false" | "mixed" {
  if (state === "checked") return "true";
  if (state === "mixed") return "mixed";
  return "false";
}

/**
 * `<lit-checkbox-tree>` — a Lit re-implementation of `@mini/lib`'s vanilla `<checkbox-tree>`,
 * reproducing its full behavior (cascade/self tri-state checking, keyboard nav, roving tabindex,
 * ARIA tree semantics, add/remove/move). Kept as a **prototype inside toc-demo**, not in `src/lib`
 * — it uses Lit and default Shadow DOM, both of which the library's vanilla/light-DOM rules forbid.
 *
 * Unlike the vanilla widget (which mutates DOM surgically), this widget is **data-driven**: every
 * mutation updates a plain node model and calls `requestUpdate()`; Lit reconciles the render. A
 * node is referenced by its `id` string only — there's no per-row custom element to hand back.
 */
class LitCheckboxTree extends LitElement {
  static readonly tagName = "lit-checkbox-tree";
  static readonly defaultLabel = "Tree";
  static readonly events = {
    change: "checkbox-tree:change",
  } as const;

  static override styles = css`
    :host {
      display: block;
    }
    .tree-node {
      display: block;
    }
    .tree-node > .tree-node__row {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      padding: 3px 8px 3px 4px;
      border-radius: 3px;
    }
    .tree-node__toggle {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      margin-top: 1px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tree-node__toggle-icon {
      width: 6px;
      height: 10px;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      transition: transform 0.15s ease;
    }
    .tree-node__checkbox {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      margin-top: 2px;
      border-radius: 2px;
      border: 1px solid currentColor;
    }
    .tree-node__checkbox[data-state="checked"] {
      background: currentColor;
    }
    .tree-node__checkbox[data-state="mixed"] {
      background: currentColor;
      opacity: 0.5;
    }
    .tree-node__content {
      flex: 1;
      min-width: 0;
    }
    .tree-node[aria-expanded="true"] > .tree-node__row .tree-node__toggle-icon {
      transform: rotate(90deg);
    }
    .tree-node.is-leaf > .tree-node__row .tree-node__toggle {
      visibility: hidden;
    }
    .tree-node > .tree-node__group {
      padding-left: 16px;
      margin-left: 7px;
      border-left: 1px solid var(--tree-indent-line, #2a2f3a);
    }
    .tree-node[aria-expanded="false"] > .tree-node__group {
      display: none;
    }
    .tree-node:focus-visible {
      outline: 2px solid var(--tree-focus-ring, #5b8af5);
      outline-offset: -2px;
    }
  `;

  #getLabel: ((def: ITreeDef) => string) | null = null;
  #checkable: Checkable = "cascade";
  #model = new CheckboxModel();
  #nodes = new Map<string, INode>();
  #roots: string[] = [];
  #tabStopId: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "tree");
    this.#applyAccessibleName();
  }

  /** Builds the tree from a flat `defs` array, replacing any previous content. */
  build<T extends ITreeDef>(defs: T[], getLabel: (def: T) => string, options: IBuildOptions = {}): void {
    this.#getLabel = getLabel as (def: ITreeDef) => string;
    this.#checkable = options.checkable ?? "cascade";
    this.#model = new CheckboxModel();
    this.#nodes = new Map();
    this.#roots = [];

    const { childrenByParent, roots } = this.#indexByParent(defs);
    for (const def of roots) {
      this.#roots.push(def.id);
      this.#addNode(def, childrenByParent);
    }

    this.#tabStopId = this.#firstVisibleRow();
    this.requestUpdate();
  }

  /** Current checked ids — see `CheckboxModel`/the vanilla widget for the cascade/self contract. */
  getChecked(): string[] {
    return this.#model.getChecked();
  }

  /** Replaces the checked set wholesale. Does not emit. */
  setChecked(ids: Iterable<string>): void {
    this.#model.setChecked(ids);
    this.requestUpdate();
  }

  expandAll(): void {
    for (const node of this.#nodes.values()) if (!node.isLeaf) node.expanded = true;
    this.requestUpdate();
  }

  collapseAll(): void {
    for (const node of this.#nodes.values()) if (!node.isLeaf) node.expanded = false;
    this.requestUpdate();
  }

  /** Inserts a new leaf under `parentId` (root if omitted/null) at `index` (appended if omitted). */
  add<T extends ITreeDef>(def: T, parentId?: string | null, index?: number): void {
    const label = this.#getLabel ? this.#getLabel(def) : def.id;
    const target = parentId ?? null;
    this.#nodes.set(def.id, {
      id: def.id,
      parentId: target,
      type: def.type ?? "label",
      label,
      isLeaf: true,
      expanded: false,
      children: [],
    });
    this.#insertInto(target, def.id, index);
    if (target !== null) this.#onParentGainedChild(target);

    this.#repairRoving();
    this.requestUpdate();
  }

  /** Detaches `id` and its subtree, forgetting any stored checked state within it. */
  removeNode(id: string): void {
    const node = this.#nodes.get(id);
    if (!node) return;

    this.#model.forget(this.#storedCheckboxIds(id));
    const parentId = node.parentId;
    this.#removeSubtree(id);
    this.#detachFromSiblings(parentId, id);

    const parent = parentId !== null ? this.#nodes.get(parentId) : undefined;
    if (parent && parent.children.length === 0) parent.isLeaf = true;

    this.#repairRoving();
    this.requestUpdate();
  }

  /** Re-parents `id` under `newParentId` (root if omitted/null) at `index`. Throws on a cycle-forming move. */
  move(id: string, newParentId?: string | null, index?: number): void {
    const node = this.#nodes.get(id);
    if (!node) return;
    const target = newParentId ?? null;
    if (target !== null && this.#isWithinSubtree(target, id)) {
      throw new Error("move: cannot move a node into its own subtree");
    }

    const oldParentId = node.parentId;
    this.#detachFromSiblings(oldParentId, id);
    node.parentId = target;
    this.#insertInto(target, id, index);

    if (oldParentId !== null && oldParentId !== target) {
      const oldParent = this.#nodes.get(oldParentId);
      if (oldParent && oldParent.children.length === 0) oldParent.isLeaf = true;
    }
    if (target !== null) this.#onParentGainedChild(target);

    this.#repairRoving();
    this.requestUpdate();
  }

  override render(): unknown {
    return html`
      <div @click=${this.#onClick} @keydown=${this.#onKeyDown} @focusin=${this.#onFocusIn}>
        ${this.#roots.map((id, i) => this.#renderNode(id, 1, this.#roots.length, i + 1))}
      </div>
    `;
  }

  #renderNode(id: string, level: number, setsize: number, posinset: number): TemplateResult {
    const node = this.#nodes.get(id)!;
    const isCheckbox = node.type === "checkbox";
    const state: CheckedState | null = isCheckbox ? this.#checkedState(node) : null;
    const tabIndexValue = id === this.#tabStopId ? 0 : -1;
    return html`
      <div
        class="tree-node ${node.isLeaf ? "is-leaf" : ""}"
        role="treeitem"
        data-id=${id}
        tabindex=${tabIndexValue}
        aria-level=${level}
        aria-setsize=${setsize}
        aria-posinset=${posinset}
        aria-labelledby="content-${id}"
        aria-expanded=${node.isLeaf ? nothing : String(node.expanded)}
        aria-checked=${state !== null ? ariaCheckedValue(state) : nothing}
      >
        <div class="tree-node__row">
          <span class="tree-node__toggle" aria-hidden="true">
            <svg class="tree-node__toggle-icon" viewBox="0 0 6 10"><path d="M1 1l4 4-4 4" /></svg>
          </span>
          ${isCheckbox ? html`<span class="tree-node__checkbox" aria-hidden="true" data-state=${state!}></span>` : nothing}
          <div class="tree-node__content" id="content-${id}">${node.label}</div>
        </div>
        ${node.children.length > 0
          ? html`<div class="tree-node__group" role="group">
              ${node.children.map((childId, i) => this.#renderNode(childId, level + 1, node.children.length, i + 1))}
            </div>`
          : nothing}
      </div>
    `;
  }

  #applyAccessibleName(): void {
    if (this.hasAttribute("aria-label") || this.hasAttribute("aria-labelledby")) return;
    this.setAttribute("aria-label", LitCheckboxTree.defaultLabel);
  }

  #indexByParent<T extends ITreeDef>(defs: T[]): { childrenByParent: Map<string, T[]>; roots: T[] } {
    const childrenByParent = new Map<string, T[]>();
    const roots: T[] = [];
    for (const def of defs) {
      if (def.parent_id === null) {
        roots.push(def);
        continue;
      }
      const siblings = childrenByParent.get(def.parent_id);
      if (siblings) siblings.push(def);
      else childrenByParent.set(def.parent_id, [def]);
    }
    return { childrenByParent, roots };
  }

  #addNode<T extends ITreeDef>(def: T, childrenByParent: Map<string, T[]>): void {
    const childDefs = childrenByParent.get(def.id) ?? [];
    this.#nodes.set(def.id, {
      id: def.id,
      parentId: def.parent_id,
      type: def.type ?? "label",
      label: this.#getLabel!(def),
      isLeaf: childDefs.length === 0,
      expanded: childDefs.length > 0 && def.expanded === true,
      children: childDefs.map((child) => child.id),
    });
    for (const child of childDefs) this.#addNode(child, childrenByParent);
  }

  #onParentGainedChild(parentId: string): void {
    const parent = this.#nodes.get(parentId);
    if (!parent || !parent.isLeaf) return;
    parent.isLeaf = false;
    if (this.#checkable === "cascade" && parent.type === "checkbox") this.#model.forget([parentId]);
  }

  #insertInto(parentId: string | null, id: string, index?: number): void {
    const siblings = this.#siblingsOf(parentId);
    if (index === undefined || index >= siblings.length) siblings.push(id);
    else siblings.splice(index, 0, id);
  }

  #detachFromSiblings(parentId: string | null, id: string): void {
    const siblings = this.#siblingsOf(parentId);
    const idx = siblings.indexOf(id);
    if (idx !== -1) siblings.splice(idx, 1);
  }

  #siblingsOf(parentId: string | null): string[] {
    if (parentId === null) return this.#roots;
    return this.#nodes.get(parentId)?.children ?? [];
  }

  #removeSubtree(id: string): void {
    const node = this.#nodes.get(id);
    if (!node) return;
    for (const childId of node.children) this.#removeSubtree(childId);
    this.#nodes.delete(id);
  }

  /** Whether `candidateId` is `ancestorId` itself, or lies within its subtree — guards `move` against cycles. */
  #isWithinSubtree(candidateId: string, ancestorId: string): boolean {
    if (candidateId === ancestorId) return true;
    const parentId = this.#nodes.get(candidateId)?.parentId ?? null;
    return parentId !== null && this.#isWithinSubtree(parentId, ancestorId);
  }

  #storedCheckboxIds(id: string): string[] {
    const node = this.#nodes.get(id);
    if (!node) return [];
    const ids: string[] = [];
    if (node.type === "checkbox" && (node.isLeaf || this.#checkable === "self")) ids.push(id);
    for (const childId of node.children) ids.push(...this.#storedCheckboxIds(childId));
    return ids;
  }

  #descendantCheckboxLeafIds(id: string): string[] {
    const node = this.#nodes.get(id);
    if (!node) return [];
    const ids: string[] = [];
    for (const childId of node.children) this.#collectCheckboxLeaves(childId, ids);
    return ids;
  }

  #collectCheckboxLeaves(id: string, out: string[]): void {
    const node = this.#nodes.get(id);
    if (!node) return;
    if (node.isLeaf && node.type === "checkbox") {
      out.push(id);
      return;
    }
    for (const childId of node.children) this.#collectCheckboxLeaves(childId, out);
  }

  #checkedState(node: INode): CheckedState {
    if (node.isLeaf || this.#checkable === "self") {
      return this.#model.isChecked(node.id) ? "checked" : "unchecked";
    }
    return this.#model.aggregate(this.#descendantCheckboxLeafIds(node.id));
  }

  #toggleExpand(id: string): void {
    const node = this.#nodes.get(id);
    if (!node || node.isLeaf) return;
    node.expanded = !node.expanded;
    this.requestUpdate();
  }

  /** The primary action on `id`: a label node expands/collapses; a checkbox node flips checked and emits `change`. */
  #togglePrimary(id: string): void {
    const node = this.#nodes.get(id);
    if (!node) return;
    if (node.type !== "checkbox") {
      this.#toggleExpand(id);
      return;
    }
    const cascadeGroup = this.#checkable === "cascade" && !node.isLeaf;
    const { checked } = cascadeGroup
      ? this.#model.toggleGroup(this.#descendantCheckboxLeafIds(id))
      : this.#model.toggleOne(id);

    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent<ICheckboxTreeChangeDetail>(LitCheckboxTree.events.change, {
        detail: { checkedIds: this.#model.getChecked(), nodeId: id, checked },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #keyHandlers: Record<string, (id: string) => void> = {
    ArrowDown: (id) => {
      const next = this.#visibleSuccessor(id);
      if (next) this.#focusRow(next);
    },
    ArrowUp: (id) => {
      const prev = this.#visiblePredecessor(id);
      if (prev) this.#focusRow(prev);
    },
    Home: () => {
      const first = this.#firstVisibleRow();
      if (first) this.#focusRow(first);
    },
    End: () => {
      const last = this.#lastVisibleRow();
      if (last) this.#focusRow(last);
    },
    ArrowRight: (id) => this.#onArrowRight(id),
    ArrowLeft: (id) => this.#onArrowLeft(id),
    Enter: (id) => this.#togglePrimary(id),
    " ": (id) => this.#togglePrimary(id),
  };

  #onKeyDown = (ev: KeyboardEvent): void => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>(".tree-node");
    const id = row?.dataset.id;
    if (!id) return;
    const handler = this.#keyHandlers[ev.key];
    if (!handler) return;
    handler(id);
    ev.preventDefault();
  };

  #onClick = (ev: MouseEvent): void => {
    const target = ev.target as HTMLElement;
    const row = target.closest<HTMLElement>(".tree-node");
    const id = row?.dataset.id;
    if (!id) return;
    if (target.closest(".tree-node__checkbox")) {
      this.#togglePrimary(id);
      return;
    }
    this.#toggleExpand(id);
  };

  #onFocusIn = (ev: FocusEvent): void => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>(".tree-node");
    if (row?.dataset.id) this.#setTabStop(row.dataset.id);
  };

  #onArrowRight(id: string): void {
    const node = this.#nodes.get(id);
    if (!node || node.isLeaf) return;
    if (!node.expanded) {
      this.#toggleExpand(id);
      return;
    }
    const child = this.#firstVisibleChild(id);
    if (child) this.#focusRow(child);
  }

  #onArrowLeft(id: string): void {
    const node = this.#nodes.get(id);
    if (!node) return;
    if (node.expanded) {
      this.#toggleExpand(id);
      return;
    }
    if (node.parentId) this.#focusRow(node.parentId);
  }

  #firstVisibleRow(): string | null {
    return this.#roots[0] ?? null;
  }

  #lastVisibleRow(): string | null {
    const lastRoot = this.#roots[this.#roots.length - 1];
    return lastRoot !== undefined ? this.#lastVisibleDescendant(lastRoot) : null;
  }

  #lastVisibleDescendant(id: string): string {
    let current = id;
    let child = this.#lastVisibleChild(current);
    while (child !== null) {
      current = child;
      child = this.#lastVisibleChild(current);
    }
    return current;
  }

  #firstVisibleChild(id: string): string | null {
    const node = this.#nodes.get(id);
    if (!node || !node.expanded || node.children.length === 0) return null;
    return node.children[0] ?? null;
  }

  #lastVisibleChild(id: string): string | null {
    const node = this.#nodes.get(id);
    if (!node || !node.expanded || node.children.length === 0) return null;
    return node.children[node.children.length - 1] ?? null;
  }

  #nextSiblingRow(id: string): string | null {
    const node = this.#nodes.get(id);
    if (!node) return null;
    const siblings = this.#siblingsOf(node.parentId);
    return siblings[siblings.indexOf(id) + 1] ?? null;
  }

  #prevSiblingRow(id: string): string | null {
    const node = this.#nodes.get(id);
    if (!node) return null;
    const siblings = this.#siblingsOf(node.parentId);
    const idx = siblings.indexOf(id);
    return idx > 0 ? (siblings[idx - 1] ?? null) : null;
  }

  #visibleSuccessor(id: string): string | null {
    const child = this.#firstVisibleChild(id);
    if (child) return child;
    let current: string | null = id;
    while (current) {
      const sibling = this.#nextSiblingRow(current);
      if (sibling) return sibling;
      current = this.#nodes.get(current)?.parentId ?? null;
    }
    return null;
  }

  #visiblePredecessor(id: string): string | null {
    const sibling = this.#prevSiblingRow(id);
    if (sibling) return this.#lastVisibleDescendant(sibling);
    return this.#nodes.get(id)?.parentId ?? null;
  }

  #setTabStop(id: string | null): void {
    if (this.#tabStopId === id) return;
    this.#tabStopId = id;
    this.requestUpdate();
  }

  #focusRow(id: string): void {
    this.#setTabStop(id);
    this.#focusElement(id);
  }

  #focusElement(id: string): void {
    void this.updateComplete.then(() => {
      this.shadowRoot?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
    });
  }

  /** Ensures exactly one row is the tab stop; reassigns (and moves focus, if it was focused) when the current one was removed. */
  #repairRoving(): void {
    if (this.#tabStopId !== null && this.#nodes.has(this.#tabStopId)) return;
    const oldId = this.#tabStopId;
    const wasFocused = oldId !== null && this.shadowRoot?.activeElement?.getAttribute("data-id") === oldId;
    this.#tabStopId = this.#firstVisibleRow();
    if (wasFocused && this.#tabStopId) this.#focusElement(this.#tabStopId);
  }
}

if (!customElements.get(LitCheckboxTree.tagName)) {
  customElements.define(LitCheckboxTree.tagName, LitCheckboxTree);
}

export { LitCheckboxTree };
export type { ITreeDef, Checkable, IBuildOptions };
