// AWESOME AI

import './ui-button.css';
import { cls, forwardedAria } from './ui-button-dom.ts';

type UiButtonType = 'button' | 'submit' | 'reset';
type UiButtonIconPosition = 'start' | 'end';

const UPGRADE_PROPS = ['label', 'icon', 'iconPosition', 'type', 'disabled', 'pressed'] as const;

const DEV: boolean = import.meta.env.DEV;

/**
 * `<ui-button>` — APG pattern: Button.
 *
 * Renders a real `<button>` in light DOM with an icon span and a label span. Pure view: no
 * state, no `setup()`, no content regions — configured entirely by attributes and properties.
 * It renders immediately on connect with safe defaults.
 */
class UiButtonElement extends HTMLElement {
  static get observedAttributes(): string[] {
    // icon-position is not observed: it is styled entirely by a CSS attribute selector, so
    // there is nothing for the component to react to.
    return ['label', 'icon', 'type', 'disabled', 'pressed', ...forwardedAria];
  }

  #rendered = false;

  #controlEl!: HTMLButtonElement;
  #iconEl!: HTMLElement;
  #labelEl!: HTMLElement;

  get label(): string {
    return this.getAttribute('label') ?? '';
  }

  set label(value: string) {
    this.setAttribute('label', value);
  }

  get icon(): string {
    return this.getAttribute('icon') ?? '';
  }

  set icon(value: string) {
    this.setAttribute('icon', value);
  }

  get iconPosition(): UiButtonIconPosition {
    return this.getAttribute('icon-position') === 'end' ? 'end' : 'start';
  }

  set iconPosition(value: UiButtonIconPosition) {
    this.setAttribute('icon-position', value);
  }

  get type(): UiButtonType {
    const value = this.getAttribute('type');
    return value === 'submit' || value === 'reset' ? value : 'button';
  }

  set type(value: UiButtonType) {
    this.setAttribute('type', value);
  }

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  set disabled(value: boolean) {
    this.toggleAttribute('disabled', value);
  }

  get pressed(): boolean {
    return this.hasAttribute('pressed');
  }

  set pressed(value: boolean) {
    this.toggleAttribute('pressed', value);
  }

  connectedCallback(): void {
    this.classList.add(cls.host);
    for (const prop of UPGRADE_PROPS) this.#upgradeProperty(prop);
    if (DEV && !this.#rendered) this.#checkChildrenSupplied();
    this.#render();
  }

  attributeChangedCallback(name: string): void {
    if (!this.#rendered) return;

    switch (name) {
      case 'label':
        this.#labelEl.textContent = this.label;
        break;
      case 'icon':
        this.#setIcon(this.icon);
        break;
      case 'type':
        this.#controlEl.type = this.type;
        break;
      case 'disabled':
        this.#controlEl.disabled = this.disabled;
        break;
      case 'pressed':
        this.#applyPressed();
        break;
      default:
        if ((forwardedAria as readonly string[]).includes(name)) this.#applyForwardedAria(name as (typeof forwardedAria)[number]);
        break;
    }
  }

  override focus(options?: FocusOptions): void {
    this.#controlEl?.focus(options);
  }

  override blur(): void {
    this.#controlEl?.blur();
  }

  /** Renders the skeleton once. Guarded so a DOM move (disconnect + reconnect) does not re-render. */
  #render(): void {
    if (this.#rendered) return;
    this.innerHTML = this.#html();
    this.#controlEl = this.querySelector<HTMLButtonElement>(`.${cls.control}`)!;
    this.#iconEl = this.querySelector<HTMLElement>(`.${cls.icon}`)!;
    this.#labelEl = this.querySelector<HTMLElement>(`.${cls.label}`)!;

    this.#controlEl.type = this.type;
    this.#controlEl.disabled = this.disabled;
    this.#applyPressed();
    this.#labelEl.textContent = this.label;
    this.#setIcon(this.icon);
    for (const name of forwardedAria) this.#applyForwardedAria(name);

    this.#rendered = true;

    if (DEV) this.#scheduleAccessibleNameCheck();
  }

  #html(): string {
    return `<button type="button" class="${cls.control}">
      <span class="${cls.icon}" aria-hidden="true"></span>
      <span class="${cls.label}"></span>
    </button>`;
  }

  #setIcon(classNames: string): void {
    this.#iconEl.replaceChildren();
    if (!classNames) return;
    const icon = document.createElement('i');
    icon.className = classNames;
    this.#iconEl.append(icon);
  }

  /**
   * Writes `aria-pressed` on the control from the `pressed` property, never the reverse — the
   * button never toggles itself. Absent, not `"false"`, when not pressed: a plain button carrying
   * `aria-pressed="false"` would announce as a toggle.
   */
  #applyPressed(): void {
    if (this.pressed) this.#controlEl.setAttribute('aria-pressed', 'true');
    else this.#controlEl.removeAttribute('aria-pressed');
  }

  /**
   * Forwards one ARIA attribute from the (non-focusable) host to the inner control. The
   * attribute stays on the host too — it has no role and is not focusable, so a duplicate there
   * announces nothing, and removing consumer markup is not this component's business.
   */
  #applyForwardedAria(name: (typeof forwardedAria)[number]): void {
    const value = this.getAttribute(name);
    if (value !== null) this.#controlEl.setAttribute(name, value);
    else this.#controlEl.removeAttribute(name);
  }

  /**
   * Dev-only: one microtask after render, flags an icon-only button with no accessible name.
   * Deferred so a consumer setting `label` right after connect isn't a false positive.
   */
  #scheduleAccessibleNameCheck(): void {
    queueMicrotask(() => {
      if (this.#labelEl.childNodes.length > 0) return;
      if (this.#controlEl.hasAttribute('aria-label') || this.#controlEl.hasAttribute('aria-labelledby')) return;
      console.error(`${this.tagName.toLowerCase()}: icon-only button has no accessible name — set "label", "aria-label", or "aria-labelledby".`);
    });
  }

  /**
   * Dev-only: at connect, before the skeleton is written, flags consumer-supplied children.
   * `ui-button` takes no content — they would otherwise be silently wiped by `#render`.
   */
  #checkChildrenSupplied(): void {
    if (!this.#hasSuppliedChildren()) return;
    console.error(`${this.tagName.toLowerCase()}: takes no content — use the "label" and "icon" attributes instead.`);
  }

  #hasSuppliedChildren(): boolean {
    for (const node of this.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent ?? '').trim() !== '') return true;
      } else {
        return true;
      }
    }
    return false;
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

if (!customElements.get('ui-button')) customElements.define('ui-button', UiButtonElement);

declare global {
  interface HTMLElementTagNameMap {
    'ui-button': UiButtonElement;
  }
}

export { UiButtonElement };
export type { UiButtonType, UiButtonIconPosition };
