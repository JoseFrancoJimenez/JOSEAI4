import './tree.css';
import { treeCss, contentId } from './tree-dom.ts';

/** `detail` payload of {@link TreeNodeElement.events.toggle}. `expanded` is the node's state *after* the toggle. */
interface ITreeNodeToggleDetail {
  expanded: boolean;
}

/**
 * Presentation of a single tree row (`role="treeitem"`) — deliberately **dumb**.
 *
 * Renders a uniform row (a visual toggle + a content wrapper holding the label), identical for
 * leaves and branches; leaf/branch is an ARIA/class difference set by {@link setLeaf}, never a
 * different DOM shape. The node carries **no checkbox knowledge** and **no event listeners** —
 * `<checkbox-tree>` delegates all interaction and owns the checkbox visual/state.
 *
 * Build is eager: a child group, once created, stays attached to the DOM for the node's lifetime.
 * Collapsing does not detach it — `<checkbox-tree>`'s stylesheet hides a collapsed group with
 * `checkbox-tree-node[aria-expanded="false"] > .tree-node__group { display: none }`, keeping the
 * tree synchronous (no retain/rebuild bookkeeping) at the scale this widget targets (≤ ~100 nodes).
 */
class TreeNodeElement extends HTMLElement {
  /** Custom element tag name. `checkbox-tree-node`, not `tree-node` — the library's other tree widget (`src/lib/widgets/tree/`) already owns that tag in the global custom element registry. */
  static readonly tagName = 'checkbox-tree-node';

  /** DOM event this element dispatches. Fires (bubbling) after every expand/collapse. */
  static readonly events = {
    toggle: 'tree-node:toggle',
  } as const;

  #expanded = false;
  #leaf = true;
  #built = false;
  #group: HTMLElement | null = null;
  #rowEl: HTMLElement | null = null;
  #contentEl: HTMLElement | null = null;

  /** Whether the node is currently expanded. Always `false` for a leaf. */
  get expanded(): boolean {
    return this.#expanded;
  }

  /** Whether the node is a leaf (no children). Controlled by the container via {@link setLeaf}. */
  get isLeaf(): boolean {
    return this.#leaf;
  }

  /** Checkbox placement for this row, stamped by the container via `data-type`. Defaults to `'label'` if never set. */
  get type(): 'checkbox' | 'label' {
    return this.dataset.type === 'checkbox' ? 'checkbox' : 'label';
  }

  /** Number of child nodes currently appended into this node's group. */
  get childCount(): number {
    return this.#group ? this.#group.childElementCount : 0;
  }

  /** The row's flex container (`.tree-node__row`) — where `<checkbox-tree>` inserts the checkbox span. */
  get rowEl(): HTMLElement {
    return this.#rowEl!;
  }

  /** The row's content wrapper (`.tree-node__content`) — holds the label and carries the `aria-labelledby` id. */
  get contentEl(): HTMLElement {
    return this.#contentEl!;
  }

  /** Builds the row skeleton and sets the label. Called once by {@link createTreeNode}. */
  configure(label: string): void {
    this.#build();
    const id = contentId();
    this.#contentEl!.id = id;
    this.#contentEl!.textContent = label;
    this.setAttribute('aria-labelledby', id);
  }

  /** Reflects leaf/branch status (`.is-leaf` class + presence/absence of `aria-expanded`). The container owns this decision. */
  setLeaf(isLeaf: boolean): void {
    this.#leaf = isLeaf;
    this.classList.toggle(treeCss.leaf, isLeaf);
    if (isLeaf) this.removeAttribute('aria-expanded');
    else this.setAttribute('aria-expanded', String(this.#expanded));
  }

  /** Expands the node (no-op on a leaf or if already expanded). Emits `toggle`. */
  expand(): void {
    if (this.#expanded || this.#leaf) return;
    this.#expanded = true;
    this.classList.add(treeCss.expanded);
    this.setAttribute('aria-expanded', 'true');
    this.#emitToggle();
  }

  /** Collapses the node (no-op if already collapsed). The group stays in the DOM; CSS hides it. Emits `toggle`. */
  collapse(): void {
    if (!this.#expanded) return;
    this.#expanded = false;
    this.classList.remove(treeCss.expanded);
    this.setAttribute('aria-expanded', 'false');
    this.#emitToggle();
  }

  /** Expands if collapsed, collapses if expanded. No-op on a leaf. */
  toggleExpand(): void {
    if (this.#leaf) return;
    if (this.#expanded) this.collapse();
    else this.expand();
  }

  /** Appends a child node into this node's group (created and attached on first use). */
  appendChildNode(child: TreeNodeElement): void {
    this.#ensureGroup().appendChild(child);
  }

  /** The row's static skeleton — **no checkbox** here; `<checkbox-tree>` inserts it into {@link rowEl} when needed. */
  protected html(): string {
    return `
      <div class="${treeCss.row}">
        <span class="${treeCss.toggle}" aria-hidden="true">
          <svg class="${treeCss.toggleIcon}" viewBox="0 0 6 10"><path d="M1 1l4 4-4 4"/></svg>
        </span>
        <div class="${treeCss.content}"></div>
      </div>
    `;
  }

  /** Builds the row once: role, baseline tabindex, skeleton, element refs. */
  #build(): void {
    if (this.#built) return;
    this.#built = true;
    this.setAttribute('role', 'treeitem');
    this.tabIndex = -1;
    this.innerHTML = this.html();
    this.#rowEl = this.querySelector(`.${treeCss.row}`);
    this.#contentEl = this.querySelector(`.${treeCss.content}`);
    this.setLeaf(this.#leaf);
  }

  /** Lazily creates and attaches the `role="group"` child container (direct child of this node). */
  #ensureGroup(): HTMLElement {
    if (!this.#group) {
      const group = document.createElement('div');
      group.className = treeCss.group;
      group.setAttribute('role', 'group');
      this.appendChild(group);
      this.#group = group;
    }
    return this.#group;
  }

  #emitToggle(): void {
    this.dispatchEvent(new CustomEvent<ITreeNodeToggleDetail>(TreeNodeElement.events.toggle, {
      detail: { expanded: this.#expanded },
      bubbles: true,
    }));
  }
}

if (!customElements.get(TreeNodeElement.tagName)) {
  customElements.define(TreeNodeElement.tagName, TreeNodeElement);
}

/** Creates and configures a `<checkbox-tree-node>` in one step — the primitive all tree composition builds on. */
function createTreeNode(label: string): TreeNodeElement {
  const el = document.createElement(TreeNodeElement.tagName) as TreeNodeElement;
  el.configure(label);
  return el;
}

export { TreeNodeElement, createTreeNode };
export type { ITreeNodeToggleDetail };
