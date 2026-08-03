import './tree.css';
import { treeCss, interactiveSelector, contentId } from './tree-dom.ts';

/** `detail` payload of the {@link TreeNodeElement.events.toggle} event. `expanded` is the node's state *after* the toggle. */
interface ITreeNodeToggleDetail {
  expanded: boolean;
}

/**
 * Presentation of a single tree row (`role="treeitem"`) — the tree's building block, deliberately **dumb**.
 *
 * Renders a **uniform** row (a visual toggle + a content wrapper holding the consumer's element), identical
 * for leaves and branches; leaf/branch is a class + ARIA difference set by {@link setLeaf}, never a different
 * DOM shape. The node owns **no** knowledge of how its children are built: the container ({@link TreeViewElement})
 * decides leaf/branch and fills children on first expand. The node only:
 *
 * - reflects what it's told — {@link setLeaf}, {@link expand}/{@link collapse};
 * - owns its child group's DOM membership — {@link appendChildNode}, and detach-**but-retain** on collapse so
 *   re-expand re-attaches the same elements (nothing is ever rebuilt — consumer content survives by construction);
 * - announces interaction — the bubbling {@link TreeNodeElement.events.toggle} event.
 *
 * Expansion truth is a local boolean, safe precisely because collapse retains rather than destroys.
 */
class TreeNodeElement extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'tree-node';

  /** DOM event this element dispatches. Fires (bubbling) after every expand/collapse — click, keyboard, or programmatic. */
  static readonly events = {
    toggle: 'tree-node:toggle',
  } as const;

  #content: HTMLElement | null = null;
  #expanded = false;
  #leaf = true;
  #group: HTMLElement | null = null;
  #rowBuilt = false;
  #toggleEl: HTMLElement | null = null;
  #contentEl: HTMLElement | null = null;

  /** Whether the node is currently expanded. Always `false` for a leaf. */
  get expanded(): boolean {
    return this.#expanded;
  }

  /** Whether the node is a leaf (no children). Controlled by the container via {@link setLeaf}. */
  get isLeaf(): boolean {
    return this.#leaf;
  }

  /** Number of child nodes currently built into this node's group (attached or retained). */
  get childCount(): number {
    return this.#group ? this.#group.childElementCount : 0;
  }

  /** Sets the row's content, then builds the row. Called once by {@link createTreeNode}, before the element is attached. */
  configure(content: HTMLElement): void {
    this.#content = content;
    this.#build();
  }

  /** Builds on connection too, in case the element is inserted before {@link configure}. No-op once built. */
  connectedCallback(): void {
    this.#build();
  }

  /** Reflects leaf/branch status (host `.is-leaf` class + `aria-expanded` presence). The container owns this decision. */
  setLeaf(isLeaf: boolean): void {
    this.#leaf = isLeaf;
    this.classList.toggle(treeCss.leaf, isLeaf);
    if (isLeaf) this.removeAttribute('aria-expanded');
    else this.setAttribute('aria-expanded', String(this.#expanded));
  }

  /** Expands the node (no-op on a leaf or if already expanded). Attaches the child group. Emits `toggle`. */
  expand(): void {
    if (this.#applyExpand()) this.#emitToggle();
  }

  /**
   * Expands **without** emitting `toggle` — for a container-driven *initial* expansion (a node whose
   * def was marked expanded), which is setup rather than a user action to broadcast. Same visual/ARIA
   * effect as {@link expand}; only the event is suppressed.
   */
  expandSilently(): void {
    this.#applyExpand();
  }

  /** Core expand: attaches the retained group and reflects expanded state. Returns `false` if it was a no-op. */
  #applyExpand(): boolean {
    if (this.#expanded || this.#leaf) return false;
    const group = this.#ensureGroup();
    if (group.parentNode !== this) this.appendChild(group);
    this.#expanded = true;
    this.classList.add(treeCss.expanded);
    this.setAttribute('aria-expanded', 'true');
    return true;
  }

  /** Collapses the node (no-op if already collapsed). Detaches — but retains — the child group. Emits `toggle`. */
  collapse(): void {
    if (!this.#expanded) return;
    this.#expanded = false;
    this.classList.remove(treeCss.expanded);
    this.setAttribute('aria-expanded', 'false');
    if (this.#group && this.#group.parentNode === this) this.removeChild(this.#group);
    this.#emitToggle();
  }

  /** Expands if collapsed, collapses if expanded. No-op on a leaf. */
  toggle(): void {
    if (this.#leaf) return;
    if (this.#expanded) this.collapse();
    else this.expand();
  }

  /** Appends a child node into this node's group (created if needed). The group is visible only while expanded. */
  appendChildNode(child: TreeNodeElement): void {
    this.#ensureGroup().appendChild(child);
  }

  /** The row's static skeleton. Injected content is appended into `.tree-node__content` afterward, never interpolated here. */
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

  /** Builds the row once: skeleton, content injection, `aria-labelledby`, click wiring, initial leaf reflection. */
  #build(): void {
    if (this.#rowBuilt || !this.#content) return;
    this.#rowBuilt = true;

    this.setAttribute('role', 'treeitem');
    this.tabIndex = -1;
    this.innerHTML = this.html();

    this.#toggleEl = this.querySelector(`.${treeCss.toggle}`);
    this.#contentEl = this.querySelector(`.${treeCss.content}`);

    const wrapper = this.#contentEl!;
    const id = contentId();
    wrapper.id = id;
    this.setAttribute('aria-labelledby', id);
    wrapper.appendChild(this.#content);

    this.#toggleEl!.addEventListener('click', this.#onToggleClick);
    wrapper.addEventListener('click', this.#onContentClick);

    this.setLeaf(this.#leaf);
  }

  /** Lazily creates the retained `role="group"` container (not attached until expanded). */
  #ensureGroup(): HTMLElement {
    if (!this.#group) {
      const group = document.createElement('div');
      group.className = treeCss.group;
      group.setAttribute('role', 'group');
      this.#group = group;
    }
    return this.#group;
  }

  #onToggleClick = (): void => {
    this.toggle();
  };

  #onContentClick = (ev: MouseEvent): void => {
    if (this.#leaf) return;
    if ((ev.target as Element).closest(interactiveSelector)) return;
    this.toggle();
  };

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

/** Creates and configures a `<tree-node>` in one step — the primitive all tree composition builds on. */
function createTreeNode(content: HTMLElement): TreeNodeElement {
  const el = document.createElement(TreeNodeElement.tagName) as TreeNodeElement;
  el.configure(content);
  return el;
}

export { TreeNodeElement, createTreeNode };
export type { ITreeNodeToggleDetail };
