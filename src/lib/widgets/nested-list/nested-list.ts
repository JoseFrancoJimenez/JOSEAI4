// AWESOME AI

// APG pattern: Disclosure (nested) — not Tree View
// (docs/tasks/nestedList/widget-nested-list-plan.md §1). Natural tab order; the only keyboard
// behaviour is the native <button>'s Enter/Space — no roving tabindex, no arrow keys, no
// preventDefault() anywhere.

import './nested-list.css';
import { cls } from './nested-list-dom.ts';
import { generateId } from '../../core/ids.ts';

interface NestedListLeaf { id: string; label: string }
interface NestedListGroup { id: string; label: string; children: NestedListItem[] }
type NestedListItem = NestedListLeaf | NestedListGroup;

interface NestedListSetup {
  items: NestedListItem[];
  renderLeaf?: (item: NestedListLeaf) => Node | string | null;
  renderGroup?: (group: NestedListGroup) => Node | string | null;
  expanded?: 'all' | string[];
}

/** `detail` of `widget-nested-list:toggle` — fired only on a user gesture (§4). */
interface NestedListToggleDetail {
  id: string;
  expanded: boolean;
}

function isGroup(item: NestedListItem): item is NestedListGroup {
  return 'children' in item;
}

/**
 * `<widget-nested-list>` — a nested list of groups and leaves. Implements setup(), recursion,
 * the expansion `Set`, the disclosure button, the toggle event, `expand`/`collapse`, and
 * `renderLeaf`/`renderGroup` extras. Deliberately stops short of Task 3's dev guard and Task 4's
 * `setItems` (`docs/tasks/nestedList/widget-nested-list-plan.md` §7) — single paint via `setup()`
 * only, no update path, no dev-only validation.
 */
class NestedListElement extends HTMLElement {
  static readonly events = {
    toggle: 'widget-nested-list:toggle',
  } as const;

  #rendered = false;
  #setupOptions: NestedListSetup | null = null;
  #expandedIds = new Set<string>();
  #expandedMode: 'all' | string[] = 'all';
  #controller: AbortController | undefined;
  #childrenEl!: HTMLUListElement;

  connectedCallback(): void {
    this.classList.add(cls.host);
    if (!this.#controller) {
      this.#controller = new AbortController();
      this.addEventListener('click', this.#onClick, { signal: this.#controller.signal });
    }
    this.#renderIfReady();
  }

  /** A move (disconnect + reconnect) leaves the listener in place; only a real removal aborts it. */
  disconnectedCallback(): void {
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.#controller?.abort();
      this.#controller = undefined;
    });
  }

  /** Called once; a later call is a no-op — later change goes through commands, not re-setup. */
  setup(options: NestedListSetup): void {
    if (this.#setupOptions) return;
    this.#setupOptions = options;
    this.#expandedMode = options.expanded ?? 'all';
    this.#renderIfReady();
  }

  /** Expands `id`'s group. A command — reflects silently, never emits (skill §8). */
  expand(id: string): void {
    this.#assertReady('expand');
    this.#setExpanded(id, true);
  }

  /** Collapses `id`'s group. A command — reflects silently, never emits (skill §8). */
  collapse(id: string): void {
    this.#assertReady('collapse');
    this.#setExpanded(id, false);
  }

  /** Currently expanded group ids. Safe empty before `setup()`. */
  get expandedIds(): string[] {
    return Array.from(this.#expandedIds);
  }

  #renderIfReady(): void {
    if (!this.isConnected || this.#rendered || !this.#setupOptions) return;
    this.#render();
    this.#rendered = true;
  }

  #render(): void {
    this.innerHTML = this.#html();
    this.#childrenEl = this.querySelector<HTMLUListElement>(`.${cls.children}`)!;
    for (const item of this.#setupOptions!.items) this.#childrenEl.append(this.#buildNode(item));
  }

  #buildNode(item: NestedListItem): HTMLLIElement {
    return isGroup(item) ? this.#buildGroup(item) : this.#buildLeaf(item);
  }

  #buildLeaf(item: NestedListLeaf): HTMLLIElement {
    const li = document.createElement('li');
    li.className = cls.leaf;
    li.dataset.id = item.id;
    li.append(this.#buildLabel(item.label));
    li.append(this.#buildExtras(this.#setupOptions!.renderLeaf, item));
    return li;
  }

  /**
   * Eager build — a collapsed group's subtree still renders, hidden by `hidden` on its children
   * `<ul>` (accessibility §7); the twisty is styled from `[aria-expanded]` only, never JS. Lazily
   * seeds `group.id` into the expansion `Set` per `#expandedMode` the first time it is built —
   * covers both the initial tree and ids added later through `setItems` (§2 "new group ids follow
   * the expanded seed mode"), without disturbing an id the user has already toggled.
   */
  #buildGroup(group: NestedListGroup): HTMLLIElement {
    if (!this.#expandedIds.has(group.id) && this.#initiallyExpanded(group.id)) this.#expandedIds.add(group.id);

    const li = document.createElement('li');
    li.className = cls.group;
    li.dataset.id = group.id;

    const expanded = this.#expandedIds.has(group.id);
    const childrenId = generateId('widget-nested-list-children');

    const twisty = document.createElement('span');
    twisty.className = cls.twisty;
    twisty.setAttribute('aria-hidden', 'true');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = cls.disclosure;
    button.dataset.id = group.id;
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-controls', childrenId);
    button.append(twisty, this.#buildLabel(group.label));

    const header = document.createElement('div');
    header.className = cls.header;
    header.append(button, this.#buildExtras(this.#setupOptions!.renderGroup, group));

    const childrenEl = document.createElement('ul');
    childrenEl.className = cls.children;
    childrenEl.id = childrenId;
    childrenEl.hidden = !expanded;
    for (const child of group.children) childrenEl.append(this.#buildNode(child));

    li.append(header, childrenEl);
    return li;
  }

  #buildLabel(text: string): HTMLSpanElement {
    const label = document.createElement('span');
    label.className = cls.label;
    label.textContent = text;
    return label;
  }

  /**
   * Extras are a sibling outlet, never inside the disclosure button (accessibility §3.2 —
   * interactive content inside a `<button>` is invalid). A Node/fragment is inserted as-is; a
   * string enters as `textContent`; `null` or an absent callback leaves the outlet empty, hidden
   * by `:empty` in CSS.
   */
  #buildExtras<T>(renderer: ((item: T) => Node | string | null) | undefined, item: T): HTMLSpanElement {
    const outlet = document.createElement('span');
    outlet.className = cls.extras;
    this.#fillExtras(outlet, renderer, item);
    return outlet;
  }

  #fillExtras<T>(outlet: HTMLElement, renderer: ((item: T) => Node | string | null) | undefined, item: T): void {
    outlet.replaceChildren();
    const content = renderer ? renderer(item) : null;
    if (typeof content === 'string') outlet.textContent = content;
    else if (content) outlet.append(content);
  }

  #html(): string {
    return `<ul class="${cls.children}"></ul>`;
  }

  /** Delegated: a click on a disclosure button toggles; anywhere else (extras included) passes through untouched. */
  #onClick = (ev: MouseEvent): void => {
    const target = ev.target as Element;
    const button = target.closest<HTMLButtonElement>(`.${cls.disclosure}`);
    if (!button) return;

    const id = button.dataset.id!;
    const expanded = !this.#expandedIds.has(id);
    this.#setExpanded(id, expanded);
    this.dispatchEvent(new CustomEvent<NestedListToggleDetail>(NestedListElement.events.toggle, {
      detail: { id, expanded },
      bubbles: true,
    }));
  };

  #setExpanded(id: string, expanded: boolean): void {
    if (expanded) this.#expandedIds.add(id);
    else this.#expandedIds.delete(id);
    this.#reflectExpanded(id, expanded);
  }

  #reflectExpanded(id: string, expanded: boolean): void {
    const button = this.querySelector<HTMLButtonElement>(`.${cls.disclosure}[data-id="${CSS.escape(id)}"]`);
    if (!button) return;
    button.setAttribute('aria-expanded', String(expanded));
    const childrenId = button.getAttribute('aria-controls');
    const childrenEl = childrenId ? document.getElementById(childrenId) : null;
    if (childrenEl) childrenEl.hidden = !expanded;
  }

  /** Whether a group id not yet tracked should start expanded, per `#expandedMode` (`'all'`, or membership in the explicit list). */
  #initiallyExpanded(id: string): boolean {
    return this.#expandedMode === 'all' || this.#expandedMode.includes(id);
  }

  #assertReady(method: string): void {
    if (!this.#setupOptions) throw new Error(`widget-nested-list: setup() must be called before ${method}()`);
  }
}

if (!customElements.get('widget-nested-list')) customElements.define('widget-nested-list', NestedListElement);

declare global {
  interface HTMLElementTagNameMap {
    'widget-nested-list': NestedListElement;
  }
}

export { NestedListElement };
export type { NestedListLeaf, NestedListGroup, NestedListItem, NestedListSetup, NestedListToggleDetail };
