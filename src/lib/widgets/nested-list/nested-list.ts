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

const DEV: boolean = import.meta.env.DEV;

function isGroup(item: NestedListItem): item is NestedListGroup {
  return 'children' in item;
}

/**
 * `<widget-nested-list>` — a nested list of groups and leaves. Complete through Task 4: setup(),
 * recursion, the expansion `Set`, the disclosure button, the toggle event, `expand`/`collapse`,
 * `renderLeaf`/`renderGroup` extras, the no-consumer-children dev guard, and the surgical
 * `setItems` keyed diff (`docs/tasks/nestedList/widget-nested-list-plan.md` §7).
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
    this.#checkDuplicateIds(options.items);
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

  /**
   * Surgical, keyed by id, level by level, against the currently rendered tree (§2): an unchanged
   * item (same id, label, children ids/order, expandable-ness) is left untouched — same DOM node,
   * same listeners, focus and scroll survive. A changed item's node is reused and updated in
   * place. Removed ids are dropped from the DOM and the expansion `Set`. Added ids get a new node,
   * seeded per the original `expanded` mode. Reordering moves existing nodes with `insertBefore`.
   */
  setItems(items: NestedListItem[]): void {
    this.#assertReady('setItems');
    this.#checkDuplicateIds(items);
    this.#reconcileLevel(this.#childrenEl, items);
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
    this.#checkConsumerChildren();
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

  /**
   * No content regions (§5): a consumer's own markup would otherwise be silently destroyed by
   * `#render()`'s `innerHTML` write with no diagnostic. Whitespace-only children (pretty-printed
   * markup) do not trigger it.
   */
  #checkConsumerChildren(): void {
    if (!DEV) return;
    const hasContent = Array.from(this.childNodes).some(
      (node) => !(node.nodeType === Node.TEXT_NODE && node.textContent!.trim() === ''),
    );
    if (hasContent) {
      console.error(
        'widget-nested-list: does not accept consumer markup — its content is destroyed. ' +
          'Per-item content goes through setup()\'s renderLeaf/renderGroup callbacks.',
      );
    }
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

  /**
   * Reconciles one `<ul class="…children">` level against `items`, keyed by each direct child
   * `<li>`'s `data-id`. Existing nodes are looked up from the live DOM — the DOM is the source of
   * truth for what is currently rendered, so there is nothing else to keep in sync.
   */
  #reconcileLevel(container: HTMLUListElement, items: NestedListItem[]): void {
    const existing = new Map<string, HTMLLIElement>();
    for (const child of Array.from(container.children)) {
      const el = child as HTMLLIElement;
      if (el.dataset.id !== undefined) existing.set(el.dataset.id, el);
    }

    const seen = new Set<string>();
    items.forEach((item, index) => {
      seen.add(item.id);
      const current = existing.get(item.id);
      const reusable = current !== undefined && current.classList.contains(cls.group) === isGroup(item);

      let node: HTMLLIElement;
      if (reusable) {
        node = current!;
        this.#reconcileNode(node, item);
      } else {
        if (current) this.#forgetExpandedSubtree(current);
        node = this.#buildNode(item);
      }

      const ref = container.children[index] as HTMLLIElement | undefined;
      if (ref !== node) container.insertBefore(node, ref ?? null);
    });

    for (const [id, node] of existing) {
      if (seen.has(id)) continue;
      this.#forgetExpandedSubtree(node);
      node.remove();
    }
  }

  /**
   * Updates an existing, type-matching node's own label/extras in place, touching nothing when
   * its label is unchanged. A group's children are always reconciled regardless — a change
   * buried deeper in the subtree does not show up in the group's own label, so recursion cannot
   * be skipped on that basis alone. This costs a few extra read-only comparisons on an otherwise
   * fully unchanged subtree; it writes nothing, so node identity and DOM position are unaffected
   * (`#reconcileLevel`'s `insertBefore` is itself already a no-op when order hasn't changed).
   */
  #reconcileNode(node: HTMLLIElement, item: NestedListItem): void {
    if (!isGroup(item)) {
      if (this.#ownLabelEl(node, false).textContent === item.label) return;
      this.#updateLabel(node, false, item.label);
      this.#fillExtras(this.#ownExtrasEl(node, false), this.#setupOptions!.renderLeaf, item);
      return;
    }

    if (this.#ownLabelEl(node, true).textContent !== item.label) {
      this.#updateLabel(node, true, item.label);
      this.#fillExtras(this.#ownExtrasEl(node, true), this.#setupOptions!.renderGroup, item);
    }
    this.#reconcileLevel(this.#ownChildrenEl(node), item.children);
  }

  #updateLabel(node: HTMLLIElement, isGroupNode: boolean, text: string): void {
    this.#ownLabelEl(node, isGroupNode).textContent = text;
  }

  #ownLabelEl(node: HTMLLIElement, isGroupNode: boolean): HTMLElement {
    const selector = isGroupNode
      ? `:scope > .${cls.header} > .${cls.disclosure} > .${cls.label}`
      : `:scope > .${cls.label}`;
    return node.querySelector<HTMLElement>(selector)!;
  }

  #ownExtrasEl(node: HTMLLIElement, isGroupNode: boolean): HTMLElement {
    const selector = isGroupNode ? `:scope > .${cls.header} > .${cls.extras}` : `:scope > .${cls.extras}`;
    return node.querySelector<HTMLElement>(selector)!;
  }

  #ownChildrenEl(node: HTMLLIElement): HTMLUListElement {
    return node.querySelector<HTMLUListElement>(`:scope > .${cls.children}`)!;
  }

  /** Drops `node`'s own id (if a group) and every descendant group id from the expansion `Set` — the node is about to be discarded. */
  #forgetExpandedSubtree(node: HTMLLIElement): void {
    if (node.classList.contains(cls.group) && node.dataset.id !== undefined) this.#expandedIds.delete(node.dataset.id);
    for (const groupEl of node.querySelectorAll<HTMLLIElement>(`.${cls.group}`)) {
      if (groupEl.dataset.id !== undefined) this.#expandedIds.delete(groupEl.dataset.id);
    }
  }

  /** Ids break `aria-controls` and the expansion `Set` if duplicated — dev-only, since it never changes correctness in prod. */
  #checkDuplicateIds(items: NestedListItem[]): void {
    if (!DEV) return;
    const seen = new Set<string>();
    const walk = (list: NestedListItem[]): void => {
      for (const item of list) {
        if (seen.has(item.id)) console.error(`widget-nested-list: duplicate item id "${item.id}".`);
        seen.add(item.id);
        if (isGroup(item)) walk(item.children);
      }
    };
    walk(items);
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
