import './toc.css';
import { tocCss, collectElementsByName } from './toc-dom.ts';
import { TocNodeElement, createTocNode } from './toc-node.ts';
import type { ITocNodeToggleDetail } from './toc-node.ts';
import type { ITocNode, ITocModelReadable } from './toc.types.ts';
import type { Subscription } from '../../../core/evented.ts';

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
 * Renders a {@link TocModel} (injected as its read-only {@link ITocModelReadable} view) as an
 * interactive, expandable tree panel.
 *
 * Pass a `renderNode` function to {@link setup} to control what each node displays. The
 * component handles the tree structure — indentation, expand/collapse toggles, and nesting.
 * When `renderNode` is omitted, {@link defaultRenderer} is used as the fallback.
 *
 * **All DOM updates are surgical.** `render()` runs only once, on initial build (from
 * `connectedCallback` / `setup`); every later change — a user toggle, `expand`/`collapse`,
 * or a model event — edits only the affected `<toc-node>`s via the `#index`. This is what
 * preserves focus, caret position, and scroll: unrelated DOM is never touched, let alone
 * destroyed and rebuilt.
 *
 * Child nodes are built lazily: added to the DOM on expand, removed on collapse. `#expanded`
 * is the sole source of truth for what's expanded — it outlives the `<toc-node>` elements
 * themselves, which are destroyed and recreated as ancestors collapse and re-expand.
 */
class TocComponent extends HTMLElement {
  /** Custom element tag name. Use with `document.createElement` or as an HTML tag. */
  static readonly tagName = 'toc-component';

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

  #model: ITocModelReadable | null = null;
  #renderNode: ((node: ITocNode) => HTMLElement) | null = null;
  #expanded: Set<string> = new Set();
  #index: Record<string, TocNodeElement> = {};
  #elements: Record<string, HTMLElement> = {};
  #rootList: HTMLUListElement | null = null;
  #subscriptions: Subscription[] = [];

  /**
   * HTML string rendered inside each toggle button as the expand/collapse icon.
   * Override in a subclass to swap the icon without touching the rest of the component.
   * @returns The SVG markup string for the arrow icon.
   */
  protected get expandIconHtml(): string {
    return `<svg class="${tocCss.arrow}" viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1l4 4-4 4"/></svg>`;
  }

  /** Called by the browser when the element is inserted into the DOM. Renders and binds events. */
  connectedCallback(): void {
    this.classList.add(tocCss.root);
    this.render();
    this.bindEvents();
  }

  /** Called by the browser when the element is removed from the DOM. Runs cleanup. */
  disconnectedCallback(): void {
    this.cleanup();
  }

  /**
   * Renders `node.id` in a `<span>` styled by {@link tocCss.nodeLabel}.
   * Override in a subclass to change the fallback used when no `renderNode`
   * function is passed to {@link setup}.
   * @param node - The tree node to render.
   * @returns A `<span>` element containing the node's id as text.
   */
  protected defaultRenderer(node: ITocNode): HTMLElement {
    const span = document.createElement('span');
    span.className = tocCss.nodeLabel;
    span.textContent = node.id;
    return span;
  }

  /**
   * Binds the component to a model and an optional node renderer.
   * May be called before or after the element is connected to the DOM.
   * All nodes start collapsed. `model` is the model's **read-only** view — this component
   * never mutates it; that guarantee is enforced by the compiler, not convention.
   * @param model - The read-only view of the {@link TocModel} to render.
   * @param renderNode - function called once per node, when it is (re)built. When omitted, {@link defaultRenderer} is used.
   */
  setup(model: ITocModelReadable, renderNode?: (node: ITocNode) => HTMLElement): void {
    this.cleanup();
    this.#model = model;
    this.#renderNode = renderNode ?? null;
    this.#expanded.clear();
    this.#index = {};
    if (this.isConnected) {
      this.render();
      this.bindEvents();
    }
  }

  /**
   * Expands the node `id` — and only that node. Deliberately does NOT expand ancestors:
   * opening a node must not force its parents open, or restoring saved state (or driving a
   * store) would re-reveal a subtree the user had collapsed. Callers that want a deep node
   * *revealed* expand its ancestor chain themselves.
   *
   * If an ancestor is currently collapsed, `id`'s row isn't in the DOM yet — the flag is
   * still recorded and applied the moment that ancestor is next expanded (the lazy build).
   *
   * Emits a single {@link TocComponent.events.change} if the state changed. No-op for
   * an unknown or childless id.
   */
  expand(id: string): void {
    const node = this.#model?.get(id);
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
      if (node.children.length && this.#setExpanded(node.id, true)) changed = true;
    }
    if (changed) this.#emitChange();
  }

  /** Collapses every node, emitting a single {@link TocComponent.events.change}. */
  collapseAll(): void {
    let changed = false;
    for (const id of [...this.#expanded]) {
      if (this.#setExpanded(id, false)) changed = true;
    }
    if (changed) this.#emitChange();
  }

  /**
   * The component's static HTML skeleton — just the root list. Elements the component needs to
   * reference after build carry `elementName`; {@link #buildSkeleton} collects them.
   */
  protected html(): string {
    return `<ul class="${tocCss.list}" elementName="rootList"></ul>`;
  }

  /**
   * Builds the tree from scratch. This is the ONLY place the full tree is built from the
   * model — every later change is a surgical edit via {@link #index}. Called once, from
   * `connectedCallback` and `setup`.
   */
  protected render(): void {
    this.#index = {};
    const rootList = this.#buildSkeleton();
    if (this.#model) {
      for (const root of this.#model.roots) rootList.appendChild(this.#buildNode(root));
    }
  }

  /** (Re)builds {@link #html}'s skeleton and stores its `elementName`-tagged elements in {@link #elements}. */
  #buildSkeleton(): HTMLUListElement {
    this.innerHTML = this.html();
    this.#elements = collectElementsByName(this);
    const rootList = this.#elements.rootList as HTMLUListElement;
    this.#rootList = rootList;
    return rootList;
  }

  /** Subscribes to model events and the node-toggle event. No-ops if already bound or no model set. */
  protected bindEvents(): void {
    if (!this.#model || this.#subscriptions.length) return;
    this.#subscriptions = [
      this.#model.on('add', this.#onModelAdd),
      this.#model.on('remove', this.#onModelRemove),
      this.#model.on('move', this.#onModelMove),
      this.#model.on('clear', this.#onModelClear),
    ];
    this.addEventListener(TocNodeElement.events.toggle, this.#onNodeToggle);
  }

  /** Removes all model subscriptions and the node-toggle listener. */
  protected cleanup(): void {
    for (const sub of this.#subscriptions) sub.remove();
    this.#subscriptions = [];
    this.removeEventListener(TocNodeElement.events.toggle, this.#onNodeToggle);
  }

  /**
   * Builds a `<toc-node>` for `node`, registers it in {@link #index}, and — if it's already
   * marked expanded in {@link #expanded} — recursively builds its (also lazily-built) children.
   * The single entry point for turning a model node into DOM, used by the initial render, the
   * lazy expand build, and reconstructing a node that reappears after a `move`.
   */
  #buildNode(node: ITocNode): TocNodeElement {
    const hasChildren = node.children.length > 0;
    const content = this.#renderNode ? this.#renderNode(node) : this.defaultRenderer(node);
    const el = createTocNode({
      id: node.id,
      hasChildren,
      content,
      toggleIconHtml: this.expandIconHtml,
    });
    this.#index[node.id] = el;
    if (hasChildren && this.#expanded.has(node.id)) {
      el.setExpanded(true);
      for (const child of node.children) el.appendChildNode(this.#buildNode(child));
    }
    return el;
  }

  /**
   * The single chokepoint for one-node expand/collapse state. Updates {@link #expanded}
   * (the truth, which survives a node's destruction) and, only if the node currently has a
   * DOM row, syncs it: reflects the new state and lazily builds/prunes its children. If the
   * row isn't rendered (an ancestor is collapsed), the DOM sync is skipped — it happens
   * later, when that ancestor's lazy build reads the now-updated `#expanded`.
   * @returns `true` if the state changed, `false` if it was already in that state.
   */
  #setExpanded(id: string, shouldExpand: boolean): boolean {
    if (this.#expanded.has(id) === shouldExpand) return false;
    if (shouldExpand) this.#expanded.add(id);
    else this.#expanded.delete(id);

    const el = this.#index[id];
    if (!el) return true;
    el.setExpanded(shouldExpand);
    if (shouldExpand) this.#buildChildrenInto(id, el);
    else this.#pruneChildrenOf(id, el);
    return true;
  }

  /** Lazily builds `id`'s children into its already-rendered row. */
  #buildChildrenInto(id: string, el: TocNodeElement): void {
    const node = this.#model?.get(id);
    if (!node) return;
    for (const child of node.children) el.appendChildNode(this.#buildNode(child));
  }

  /** Unregisters `id`'s children from {@link #index} and removes them from its row. */
  #pruneChildrenOf(id: string, el: TocNodeElement): void {
    const node = this.#model?.get(id);
    if (node) for (const child of node.children) this.#pruneIndexSubtree(child);
    el.clearChildren();
  }

  /**
   * Unregisters `node` and its whole subtree from {@link #index} only. Deliberately leaves
   * {@link #expanded} untouched: the node still exists in the model, just its `<toc-node>`
   * is (about to be) destroyed — collapsing an ancestor, or dropping a `move` target into a
   * collapsed parent. Expansion state must survive so it reappears exactly as the user left
   * it the next time this subtree is (lazily) rebuilt.
   */
  #pruneIndexSubtree(node: ITocNode): void {
    delete this.#index[node.id];
    for (const child of node.children) this.#pruneIndexSubtree(child);
  }

  /**
   * Unregisters `node` and its whole subtree from both {@link #index} and {@link #expanded}.
   * Only for nodes that no longer exist in the model at all (a `remove`) — there is nothing
   * left to "remember" expansion state for.
   */
  #pruneAll(node: ITocNode): void {
    delete this.#index[node.id];
    this.#expanded.delete(node.id);
    for (const child of node.children) this.#pruneAll(child);
  }

  /** Reflects `parent`'s current leaf/branch status on its row, if rendered. No-op for a root's null parent. */
  #syncLeaf(parent: ITocNode | null): void {
    if (!parent) return;
    this.#index[parent.id]?.setLeaf(parent.children.length === 0);
  }

  #onModelAdd = ({ node }: { node: ITocNode }): void => {
    const parent = node.parent;
    if (!parent) {
      this.#rootList?.appendChild(this.#buildNode(node));
      return;
    }
    const parentEl = this.#index[parent.id];
    if (!parentEl) return; // an ancestor is collapsed; picked up by the lazy build later
    parentEl.setLeaf(false); // may have just gained its first child
    if (this.#expanded.has(parent.id)) parentEl.appendChildNode(this.#buildNode(node));
  };

  #onModelRemove = ({ node }: { node: ITocNode }): void => {
    this.#index[node.id]?.detach();
    this.#pruneAll(node);
    this.#syncLeaf(node.parent);
  };

  /**
   * `move` is the complex reaction: the model already decided and validated (cycle
   * detection) and mutated the tree — this only syncs the DOM. Re-parenting the actual
   * element (rather than rebuilding) is what makes indentation "just work": it's structural
   * (nested `<ul>`s), so moving the element into new nesting fixes it automatically.
   */
  #onModelMove = ({ node, previousParent }: { node: ITocNode; previousParent: ITocNode | null }): void => {
    this.#syncLeaf(previousParent);
    this.#syncLeaf(node.parent);

    const existing = this.#index[node.id];
    existing?.detach();

    const newParent = node.parent;
    const parentEl = newParent ? this.#index[newParent.id] : null;
    const targetOpen = newParent === null || (parentEl !== undefined && this.#expanded.has(newParent.id));

    if (!targetOpen) {
      if (existing) this.#pruneIndexSubtree(node); // keep #expanded — it may reappear on a later expand
      return;
    }
    const el = existing ?? this.#buildNode(node);
    if (parentEl) parentEl.appendChildNode(el);
    else this.#rootList?.appendChild(el);
  };

  #onModelClear = (): void => {
    this.#expanded.clear();
    this.#index = {};
    this.#buildSkeleton();
  };

  /** A `<toc-node>` announced a click on its toggle (or expandable content). The widget owns the resulting state. */
  #onNodeToggle = (ev: Event): void => {
    const { id } = (ev as CustomEvent<ITocNodeToggleDetail>).detail;
    const shouldExpand = !this.#expanded.has(id);
    if (!this.#setExpanded(id, shouldExpand)) return;
    this.#emitClickToggle(id, shouldExpand);
    this.#emitChange();
  };

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
}

if (!customElements.get(TocComponent.tagName)) {
  customElements.define(TocComponent.tagName, TocComponent);
}

export { TocComponent };
export type { ITocToggleDetail, ITocChangeDetail };
