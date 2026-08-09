// APG pattern: none — role="group" of ordinary buttons in natural tab order (docs/accessibility.md §1, §4).

import './button-group.css';
import { cls } from './button-group-dom.ts';
import { UiButtonElement } from '../../elements/ui-button/ui-button.ts';

type ButtonGroupOrientation = 'horizontal' | 'vertical';

/** `detail` of `widget-button-group:change` — see `docs/tasks/buttonGroup/widget-button-group.md` §6. */
interface ButtonGroupChangeDetail {
  value: string | null;
}

const UPGRADE_PROPS = ['orientation'] as const;

const DEV: boolean = import.meta.env.DEV;

/**
 * `<widget-button-group>` — a `role="group"` of consumer-supplied `ui-button`s (subclasses
 * included), of which at most one is active. Owns selection state; adds no keyboard model — each
 * button is its own Tab stop and the group writes no `tabindex` anywhere.
 *
 * No skeleton to render: the children are the content, read from the DOM per operation rather
 * than cached (`docs/tasks/buttonGroup/widget-button-group.md` §7).
 */
class ButtonGroupElement extends HTMLElement {
  #initialized = false;

  // Not observed: orientation is styled entirely by a CSS attribute selector, nothing to react to.
  get orientation(): ButtonGroupOrientation {
    return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
  }

  set orientation(value: ButtonGroupOrientation) {
    this.setAttribute('orientation', value);
  }

  /** The currently active child, or `null` if none is. Not the identity channel — see `activeValue`. */
  get activeButton(): UiButtonElement | null {
    for (const child of this.children) {
      if (child instanceof UiButtonElement && child.pressed) return child;
    }
    return null;
  }

  /** The active child's `value`, or `null` if none is active. */
  get activeValue(): string | null {
    return this.activeButton?.value ?? null;
  }

  connectedCallback(): void {
    this.classList.add(cls.host);
    for (const prop of UPGRADE_PROPS) this.#upgradeProperty(prop);
    this.setAttribute('role', 'group');
    this.addEventListener('click', this.#onClick);

    if (!this.#initialized) {
      this.#checkAccessibleName();
      this.#checkChildren();
      this.#initialized = true;
    }
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.#onClick);
  }

  /** Reflects `value` as the sole active child; does not emit. An unknown value clears the selection, same as `null`. */
  setActive(value: string | null): void {
    for (const child of this.children) {
      if (child instanceof UiButtonElement) child.pressed = child.value === value;
    }
  }

  /** Dev-only: `role="group"` with no name announces as unnamed noise. Deferred a microtask so a consumer setting `aria-label` right after connect is not falsely flagged. */
  #checkAccessibleName(): void {
    if (!DEV) return;
    queueMicrotask(() => {
      if (this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby')) return;
      console.error(
        `${this.tagName.toLowerCase()}: role="group" has no accessible name — set "aria-label" or "aria-labelledby".`,
      );
    });
  }

  /**
   * Dev-only: a non-`ui-button` child, a `ui-button` missing `value`, or a duplicate `value` are
   * each silently broken at selection time rather than loud, so they are surfaced here instead.
   * Deferred a microtask so a consumer setting `value` right after connect is not falsely flagged.
   */
  #checkChildren(): void {
    if (!DEV) return;
    queueMicrotask(() => {
      const seen = new Set<string>();
      for (const child of this.children) {
        if (!(child instanceof UiButtonElement)) {
          console.error(
            `${this.tagName.toLowerCase()}: child <${child.tagName.toLowerCase()}> is not a ui-button — ignored.`,
          );
          continue;
        }
        if (!child.value) {
          console.error(`${this.tagName.toLowerCase()}: a ui-button child has no "value" — it cannot be selected.`);
          continue;
        }
        if (seen.has(child.value)) {
          console.error(`${this.tagName.toLowerCase()}: duplicate value "${child.value}" among children.`);
          continue;
        }
        seen.add(child.value);
      }
    });
  }

  /**
   * Delegated click: resolves the direct child under `event.target` (never `closest`, which would
   * match a `ui-button`'s inner control first — §7), then toggles it. Clicking the active child
   * deselects it; clicking any other selects it exclusively. Emits on every resolved click, since
   * it is always a user gesture reaching a `ui-button`'s native control.
   */
  #onClick = (event: MouseEvent): void => {
    const child = this.#resolveChild(event.target);
    if (!child) return;

    const next = child.pressed ? null : child.value;
    this.setActive(next);
    this.dispatchEvent(
      new CustomEvent<ButtonGroupChangeDetail>('widget-button-group:change', { detail: { value: next }, bubbles: true }),
    );
  };

  /** Walks up from `target` to the node whose parent is the host, then checks it is a `ui-button`. */
  #resolveChild(target: EventTarget | null): UiButtonElement | null {
    let node = target instanceof Node ? target : null;
    while (node && node.parentElement !== this) node = node.parentElement;
    return node instanceof UiButtonElement ? node : null;
  }

  /** Moves a value written before class registration off the instance so the prototype accessor takes over. */
  #upgradeProperty(prop: (typeof UPGRADE_PROPS)[number]): void {
    if (!Object.hasOwn(this, prop)) return;
    const bag = this as unknown as Record<string, unknown>;
    const value = bag[prop];
    delete bag[prop];
    bag[prop] = value;
  }
}

if (!customElements.get('widget-button-group')) customElements.define('widget-button-group', ButtonGroupElement);

declare global {
  interface HTMLElementTagNameMap {
    'widget-button-group': ButtonGroupElement;
  }
}

export { ButtonGroupElement };
export type { ButtonGroupOrientation, ButtonGroupChangeDetail };
