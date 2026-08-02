import './toc.css';
import { tocCss, interactiveSelector } from './toc-dom.ts';

/** Props-in config applied once via {@link TocNodeElement.configure}. */
interface ITocNodeConfig {
  id: string;
  hasChildren: boolean;
  content: HTMLElement;
  toggleIconHtml: string;
}

/** `detail` payload of {@link TocNodeElement.events.toggle} — internal, not part of the widget's public contract. */
interface ITocNodeToggleDetail {
  id: string;
}

/**
 * Presentation of a single TOC row. Internal building block of the TOC widget — not a public API.
 *
 * Renders a **uniform** row (toggle button + content wrapper) regardless of leaf/branch status;
 * `setLeaf` only flips a class + ARIA, never the DOM shape. Owns no domain state: expansion truth,
 * the tree structure, and the id index all live in `TocComponent`. This element only reflects what
 * it's told (`setExpanded`, `setLeaf`) and announces user interaction (`toggle`) upward.
 */
class TocNodeElement extends HTMLElement {
  static readonly tagName = 'toc-node';

  static readonly events = {
    toggle: 'toc:node:toggle',
  } as const;

  #id = '';
  #hasChildren = false;
  #toggleBtn: HTMLButtonElement | null = null;
  #contentWrapper: HTMLDivElement | null = null;
  #childList: HTMLUListElement | null = null;

  /** The tree node id this element represents. */
  get nodeId(): string {
    return this.#id;
  }

  /** Builds the row's DOM once. Must be called exactly once, before the element is used. */
  configure({ id, hasChildren, content, toggleIconHtml }: ITocNodeConfig): void {
    this.#id = id;
    this.dataset.nodeId = id;

    const row = document.createElement('div');
    row.className = tocCss.row;

    const toggle = document.createElement('button');
    toggle.className = tocCss.toggle;
    toggle.innerHTML = toggleIconHtml;
    toggle.addEventListener('click', this.#handleToggleClick);
    this.#toggleBtn = toggle;
    row.appendChild(toggle);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = tocCss.content;
    contentWrapper.addEventListener('click', this.#handleContentClick);
    contentWrapper.appendChild(content);
    this.#contentWrapper = contentWrapper;
    row.appendChild(contentWrapper);

    this.replaceChildren(row);
    this.setLeaf(!hasChildren);
  }

  /** Reflects the expanded/collapsed state (class + ARIA). Does not build or prune children — the caller does. */
  setExpanded(expanded: boolean): void {
    this.classList.toggle(tocCss.expanded, expanded);
    if (!this.#hasChildren) return;
    this.#toggleBtn?.classList.toggle(tocCss.expanded, expanded);
    this.#toggleBtn?.setAttribute('aria-expanded', String(expanded));
  }

  /** Reflects leaf/branch status (class + ARIA) without changing the row's DOM shape. */
  setLeaf(isLeaf: boolean): void {
    this.#hasChildren = !isLeaf;
    this.#toggleBtn?.classList.toggle(tocCss.toggleLeaf, isLeaf);
    this.#contentWrapper?.classList.toggle(tocCss.contentExpandable, !isLeaf);
    if (isLeaf) {
      this.#toggleBtn?.setAttribute('aria-hidden', 'true');
      this.#toggleBtn?.removeAttribute('aria-expanded');
    } else {
      this.#toggleBtn?.removeAttribute('aria-hidden');
      const isExpanded = this.classList.contains(tocCss.expanded);
      this.#toggleBtn?.setAttribute('aria-expanded', String(isExpanded));
    }
  }

  /** The lazily-created `<ul>` that holds this row's child `<toc-node>`s. */
  get childList(): HTMLUListElement {
    if (!this.#childList) {
      const ul = document.createElement('ul');
      ul.className = `${tocCss.list} ${tocCss.listNested}`;
      this.#childList = ul;
      this.appendChild(ul);
    }
    return this.#childList;
  }

  /** Appends `child` to this row's child list, creating the list if needed. */
  appendChildNode(child: TocNodeElement): void {
    this.childList.appendChild(child);
  }

  /** Removes the child list (and everything in it) from the DOM. No-op if never built. */
  clearChildren(): void {
    this.#childList?.remove();
    this.#childList = null;
  }

  /** Removes this row (and its subtree, since children live inside it) from the DOM. */
  detach(): void {
    this.remove();
  }

  #handleToggleClick = (ev: MouseEvent): void => {
    ev.stopPropagation();
    this.#emitToggle();
  };

  #handleContentClick = (ev: MouseEvent): void => {
    if (!this.#hasChildren) return;
    const target = ev.target as Element;
    if (target.closest(interactiveSelector)) return;
    ev.stopPropagation();
    this.#emitToggle();
  };

  #emitToggle(): void {
    this.dispatchEvent(new CustomEvent<ITocNodeToggleDetail>(TocNodeElement.events.toggle, {
      detail: { id: this.#id },
      bubbles: true,
    }));
  }
}

if (!customElements.get(TocNodeElement.tagName)) {
  customElements.define(TocNodeElement.tagName, TocNodeElement);
}

/** Creates and configures a `<toc-node>` in one step. The only place that casts the raw element. */
function createTocNode(config: ITocNodeConfig): TocNodeElement {
  const el = document.createElement(TocNodeElement.tagName) as TocNodeElement;
  el.configure(config);
  return el;
}

export { TocNodeElement, createTocNode };
export type { ITocNodeConfig, ITocNodeToggleDetail };
