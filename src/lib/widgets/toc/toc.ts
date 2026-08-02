import './toc.css';
import type { TocModel } from './toc-model.ts';
import type { ITocNode } from './toc.types.ts';
import type { Subscription } from '../../core/evented.ts';

/**
 * `detail` payload of the {@link TocComponent.events.clickToggle} event — the single
 * node a user just toggled. `expanded` is its state *after* the toggle.
 */
interface ITocToggleDetail {
  id: string;
  expanded: boolean;
}

/**
 * `detail` payload of the {@link TocComponent.events.change} event — a snapshot copy of
 * every currently-expanded node id, emitted after any change (click or programmatic).
 */
interface ITocChangeDetail {
  expanded: string[];
}

/**
 * Renders a {@link TocModel} as an interactive, expandable tree panel.
 *
 * Pass a `renderNode` function to {@link setup} to control what each node displays.
 * The component handles the tree structure — indentation, expand/collapse toggles, and nesting.
 * When `renderNode` is omitted, {@link defaultRenderer} is used as the fallback.
 *
 * Child nodes are built lazily: they are added to the DOM on expand and removed on collapse.
 * The component re-renders the visible tree whenever the model fires `add`, `remove`, `move`, or `clear`.
 */
class TocComponent extends HTMLElement {
  /** Custom element tag name. Use with `document.createElement` or as an HTML tag. */
  static readonly tagName = 'toc-component';

  /** Selector matching elements that should not trigger an expand/collapse when clicked. */
  static readonly interactiveSelector = 'input, button, select, textarea, a[href], label';

  /**
   * Names of the DOM events this component dispatches.
   * `clickToggle` ({@link ITocToggleDetail}) fires only on a user click, naming the node
   * toggled. `change` ({@link ITocChangeDetail}) fires after *any* change — click or
   * programmatic — carrying a snapshot of all expanded ids; a click emits `clickToggle`
   * then `change`. Consumers mirror expansion from `change` and use `clickToggle` only if
   * they need to react to a user's intent specifically.
   */
  static readonly events = {
    clickToggle: 'toc:click:toggle',
    change: 'toc:change',
  } as const;

  /** CSS class names used by this component. Override in a subclass to restyle without touching logic. */
  static readonly css = {
    root:              TocComponent.tagName,
    list:              'toc-list',
    listNested:        'toc-list--nested',
    treeNode:          'toc-node',
    nodeLabel:         'toc-node-label',
    row:               'toc-row',
    toggle:            'toc-toggle',
    arrow:             'toc-arrow',
    indent:            'toc-indent',
    content:           'toc-content',
    contentExpandable: 'toc-content--expandable',
    expanded:          'is-expanded',
  } as const;

  #model: TocModel | null = null;
  #renderNode: ((node: ITocNode) => HTMLElement) | null = null;
  #expanded: Set<string> = new Set();
  #subscriptions: Subscription[] = [];

  /**
   * HTML string rendered inside each toggle button as the expand/collapse icon.
   * Override in a subclass to swap the icon without touching the rest of the component.
   * @returns The SVG markup string for the arrow icon.
   */
  protected get expandIconHtml(): string {
    return `<svg class="${TocComponent.css.arrow}" viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1l4 4-4 4"/></svg>`;
  }

  /** Called by the browser when the element is inserted into the DOM. Renders and binds events. */
  connectedCallback(): void {
    this.classList.add(TocComponent.css.root);
    this.render();
    this.bindEvents();
  }

  /** Called by the browser when the element is removed from the DOM. Runs cleanup. */
  disconnectedCallback(): void {
    this.cleanup();
  }

  /**
   * Renders `node.id` in a `<span>` styled by `TocComponent.css.nodeLabel`.
   * Override in a subclass to change the fallback used when no `renderNode`
   * function is passed to {@link setup}.
   * @param node - The tree node to render.
   * @returns A `<span>` element containing the node's id as text.
   */
  protected defaultRenderer(node: ITocNode): HTMLElement {
    const span = document.createElement('span');
    span.className = TocComponent.css.nodeLabel;
    span.textContent = node.id;
    return span;
  }

  /**
   * Binds the component to a model and an optional node renderer.
   * May be called before or after the element is connected to the DOM.
   * All nodes start collapsed.
   * @param model - The {@link TocModel} to render.
   * @param renderNode - function called once per node per render cycle. When omitted, {@link defaultRenderer} is used.
   */
  setup(model: TocModel, renderNode?: (node: ITocNode) => HTMLElement): void {
    this.#model = model;
    this.#renderNode = renderNode ?? null;
    this.#expanded.clear();
    if (this.isConnected) {
      this.cleanup();
      this.render();
      this.bindEvents();
    }
  }

  /**
   * Expands the node `id` — and only that node. Its expanded flag is set and the
   * DOM updated surgically; when an ancestor is collapsed the node's row isn't in
   * the DOM yet, so the flag is simply remembered and applied by {@link render}
   * when that ancestor next expands.
   *
   * Deliberately does NOT expand ancestors. Expansion is declarative state: opening
   * a node must not force its parents open, or restoring a saved state (or driving
   * the store) would re-reveal a subtree the user had collapsed. Callers that want a
   * deep node *revealed* expand its ancestor chain themselves.
   *
   * Emits a single {@link TocComponent.events.change} if the state changed. No-op for
   * an unknown or childless id.
   */
  expand(id: string): void {
    if (!this.#model) return;
    const node = this.#model.get(id);
    if (!node || !node.children.length) return;
    if (this.#setExpanded(id, true)) this.#emitChange();
  }

  /**
   * Collapses the node `id` (no-op if already collapsed). Emits a single
   * {@link TocComponent.events.change} when the state changes.
   */
  collapse(id: string): void {
    if (this.#setExpanded(id, false)) this.#emitChange();
  }

  /** Expands every node that has children, emitting a single {@link TocComponent.events.change}. */
  expandAll(): void {
    if (!this.#model) return;
    let changed = false;
    for (const node of this.#model) {
      if (node.children.length && !this.#expanded.has(node.id)) {
        this.#expanded.add(node.id);
        changed = true;
      }
    }
    if (!changed) return;
    this.render();
    this.#emitChange();
  }

  /** Collapses every node, emitting a single {@link TocComponent.events.change}. */
  collapseAll(): void {
    if (this.#expanded.size === 0) return;
    this.#expanded.clear();
    this.render();
    this.#emitChange();
  }

  /** Renders the component based on the current model state. */
  protected render(): void {
    if (!this.#model) { this.replaceChildren(); return; }
    const ul = document.createElement('ul');
    ul.className = TocComponent.css.list;
    for (const root of this.#model.roots) ul.appendChild(this.#buildNode(root));
    this.replaceChildren(ul);
  }

  /**
   * Subscribes to model events and attaches the root click handler.
   * No-ops if already bound or if no model is set.
   */
  protected bindEvents(): void {
    if (!this.#model || this.#subscriptions.length) return;
    this.#subscriptions = [
      this.#model.on('add',    () => this.render()),
      this.#model.on('remove', ({ node }) => { this.#pruneExpanded(node); this.render(); }),
      this.#model.on('move',   () => this.render()),
      this.#model.on('clear',  () => { this.#expanded.clear(); this.render(); }),
    ];
    this.addEventListener('click', this.#handleClick);
  }

  /** Removes all model subscriptions and the root click handler. */
  protected cleanup(): void {
    for (const sub of this.#subscriptions) sub.remove();
    this.#subscriptions = [];
    this.removeEventListener('click', this.#handleClick);
  }

  /**
   * Builds the `<li>` for a single node, including its toggle button (or indent spacer),
   * content wrapper, and — when already expanded — its nested child list.
   * @param node - The tree node to build.
   * @returns The `<li>` element representing the node.
   */
  #buildNode(node: ITocNode): HTMLElement {
    const { treeNode, expanded, row, toggle, indent, content, contentExpandable } = TocComponent.css;
    const hasChildren = node.children.length > 0;
    const isExpanded = this.#expanded.has(node.id);

    // Root <li>, carries the node id as a data attribute for event delegation
    const li = document.createElement('li');
    li.className = treeNode;
    if (isExpanded) li.classList.add(expanded);
    li.dataset.nodeId = node.id;

    // Row flex, container holding the toggle/indent and the content area
    const rowEl = document.createElement('div');
    rowEl.className = row;

    // Toggle button (parent nodes) or indent spacer (leaf nodes)
    if (hasChildren) {
      // Create expand element
      const btn = document.createElement('button');
      btn.className = toggle;
      if (isExpanded) btn.classList.add(expanded); // mirrors initial state
      btn.dataset.nodeId = node.id;                // used by #handleClick for delegation
      btn.setAttribute('aria-label', `Toggle ${node.id}`);
      btn.setAttribute('aria-expanded', String(isExpanded));
      btn.innerHTML = this.expandIconHtml;         // icon — override expandIconHtml to customise
      rowEl.appendChild(btn);
    } else {
      // Leaf node, spacer keeps content aligned with parent rows
      const indentEl = document.createElement('span');
      indentEl.className = indent;
      rowEl.appendChild(indentEl);
    }

    // Content area, consumer-supplied element or defaultRenderer fallback
    const contentWrapper = document.createElement('div');
    contentWrapper.className = hasChildren ? `${content} ${contentExpandable}` : content;
    if (hasChildren) contentWrapper.dataset.toggleId = node.id;
    contentWrapper.appendChild(this.#renderNode ? this.#renderNode(node) : this.defaultRenderer(node));
    rowEl.appendChild(contentWrapper);
    li.appendChild(rowEl);

    // Child list, only appended when already expanded (lazy otherwise)
    if (hasChildren && isExpanded) {
      li.appendChild(this.#buildChildList(node));
    }

    return li;
  }

  /**
   * Wraps all children of `node` in a nested `<ul>`.
   * @param node - The parent node whose children to render.
   * @returns A `<ul>` element containing one `<li>` per child.
   */
  #buildChildList(node: ITocNode): HTMLElement {
    const { list, listNested } = TocComponent.css;
    const ul = document.createElement('ul');
    ul.className = `${list} ${listNested}`;
    for (const child of node.children) ul.appendChild(this.#buildNode(child));
    return ul;
  }

  /**
   * Delegated click handler for the entire component.
   * Intercepts clicks on `.toc-toggle` buttons and on expandable content areas,
   * stopping propagation in both cases. All other clicks bubble normally.
   * @param ev - The mouse event from the delegated listener.
   */
  #handleClick = (ev: MouseEvent): void => {
    const { toggle, contentExpandable } = TocComponent.css;
    const target = ev.target as Element;

    // Click on the toggle button (highest priority, always fires)
    const toggleEl = target.closest<HTMLElement>(`.${toggle}`);
    if (toggleEl?.dataset.nodeId) {
      ev.stopPropagation();
      this.#toggle(toggleEl.dataset.nodeId);
      return;
    }

    // Click on expandable content area (skipped if the click landed on an interactive element)
    const expandableContent = target.closest<HTMLElement>(`.${contentExpandable}`);
    if (expandableContent?.dataset.toggleId && !target.closest(TocComponent.interactiveSelector)) {
      ev.stopPropagation();
      this.#toggle(expandableContent.dataset.toggleId);
    }
  };

  /**
   * Toggles the expand/collapse state of the node identified by `id`. The click entry
   * point: when the state changes it emits {@link TocComponent.events.clickToggle} (the
   * clicked node) followed by {@link TocComponent.events.change} (the full snapshot).
   * @param id - The id of the node to toggle.
   */
  #toggle(id: string): void {
    const shouldExpand = !this.#expanded.has(id);
    if (!this.#setExpanded(id, shouldExpand)) return;
    this.#emitClickToggle(id, shouldExpand);
    this.#emitChange();
  }

  /**
   * Sets the expanded state of `id` via a surgical DOM update. The single chokepoint for
   * one-node changes; it does not emit — the caller decides which event fits (`toggle`
   * for a click, `autoToggle` for a programmatic change).
   * @param id - The id of the node to expand or collapse.
   * @param shouldExpand - `true` to expand, `false` to collapse.
   * @returns `true` if the state changed, `false` if it was already in that state.
   */
  #setExpanded(id: string, shouldExpand: boolean): boolean {
    if (this.#expanded.has(id) === shouldExpand) return false;
    if (shouldExpand) this.#expanded.add(id);
    else this.#expanded.delete(id);
    this.#applyExpanded(id, shouldExpand);
    return true;
  }

  /**
   * Surgically syncs the DOM of node `id` to `shouldExpand` — toggling classes/aria and
   * appending or removing its nested child list, without re-rendering siblings. Callers
   * update {@link #expanded} first; this only touches the DOM and no-ops if the node
   * isn't currently rendered (e.g. an ancestor is collapsed), in which case its child
   * list is built lazily when that ancestor next expands.
   * @param id - The id of the node to sync.
   * @param shouldExpand - The target expanded state to reflect in the DOM.
   */
  #applyExpanded(id: string, shouldExpand: boolean): void {
    const { treeNode, expanded, toggle, listNested } = TocComponent.css;

    const nodeEl = [...this.querySelectorAll<HTMLElement>(`.${treeNode}`)]
      .find(el => el.dataset.nodeId === id) ?? null;
    if (!nodeEl) return;

    nodeEl.classList.toggle(expanded, shouldExpand);
    const toggleBtn = nodeEl.querySelector<HTMLElement>(`.${toggle}`);
    toggleBtn?.classList.toggle(expanded, shouldExpand);
    toggleBtn?.setAttribute('aria-expanded', String(shouldExpand));

    if (shouldExpand) {
      const tocNode = this.#model?.get(id);
      if (tocNode) nodeEl.appendChild(this.#buildChildList(tocNode));
    } else {
      nodeEl.querySelector(`.${listNested}`)?.remove();
    }
  }

  /** Dispatches {@link TocComponent.events.clickToggle} naming the node a user just toggled. */
  #emitClickToggle(id: string, expanded: boolean): void {
    this.dispatchEvent(new CustomEvent<ITocToggleDetail>(TocComponent.events.clickToggle, {
      detail: { id, expanded },
      bubbles: true,
    }));
  }

  /** Dispatches {@link TocComponent.events.change} with a snapshot copy of all expanded ids. */
  #emitChange(): void {
    this.dispatchEvent(new CustomEvent<ITocChangeDetail>(TocComponent.events.change, {
      detail: { expanded: [...this.#expanded] },
      bubbles: true,
    }));
  }

  /**
   * Recursively removes `node` and its entire subtree from the expanded set.
   * @param node - The root of the subtree to prune.
   */
  #pruneExpanded(node: ITocNode): void {
    this.#expanded.delete(node.id);
    for (const child of node.children) this.#pruneExpanded(child);
  }
}

if (!customElements.get(TocComponent.tagName)) {
  customElements.define(TocComponent.tagName, TocComponent);
}

export { TocComponent };
export type { ITocToggleDetail, ITocChangeDetail };