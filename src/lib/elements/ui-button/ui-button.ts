// AWESOME AI

import './ui-button.css';
import { cls, forwardedAria } from './ui-button-dom.ts';

type UiButtonType = 'button' | 'submit' | 'reset';
type UiButtonIconPosition = 'start' | 'end';

const UPGRADE_PROPS = ['label', 'icon', 'iconPosition', 'type', 'disabled', 'pressed', 'value'] as const;

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

  // Not observed: icon-position is styled entirely by a CSS attribute selector, nothing to react to.
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

  // Not observed: nothing in the component reacts to value; the getter reads the attribute live.
  get value(): string {
    return this.getAttribute('value') ?? '';
  }

  set value(value: string) {
    this.setAttribute('value', value);
  }

  connectedCallback(): void {
    this.classList.add(cls.host);
    for (const prop of UPGRADE_PROPS) this.#upgradeProperty(prop);
    if (!this.#rendered) this.#checkChildren();
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
        if ((forwardedAria as readonly string[]).includes(name)) this.#forwardAria(name);
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
    this.#labelEl.textContent = this.label;
    this.#setIcon(this.icon);
    this.#applyPressed();
    for (const name of forwardedAria) this.#forwardAria(name);

    this.#rendered = true;
    this.#checkAccessibleName();
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

  /** `pressed` writes `aria-pressed="true"` on the control; absent removes the attribute entirely — never `"false"`. */
  #applyPressed(): void {
    if (this.pressed) this.#controlEl.setAttribute('aria-pressed', 'true');
    else this.#controlEl.removeAttribute('aria-pressed');
  }

  /** Forwards one ARIA attribute from the (non-focusable) host to the inner control. */
  #forwardAria(name: string): void {
    const value = this.getAttribute(name);
    if (value !== null) this.#controlEl.setAttribute(name, value);
    else this.#controlEl.removeAttribute(name);
  }

  /** Dev-only: `ui-button` takes no content — consumer children would be silently wiped by `#render`. */
  #checkChildren(): void {
    if (!DEV) return;
    const hasContent = Array.from(this.childNodes).some(
      (node) => node.nodeType !== Node.TEXT_NODE || node.textContent!.trim() !== '',
    );
    if (!hasContent) return;
    console.error(
      `${this.tagName.toLowerCase()}: takes no content — children are discarded. Use "label" and "icon" instead.`,
    );
  }

  /**
   * Dev-only: an icon-only button with no accessible name is unusable for assistive tech.
   * Deferred a microtask past first render so a consumer setting `label` right after connect
   * (a common pattern) does not trip a false alarm.
   */
  #checkAccessibleName(): void {
    if (!DEV) return;
    queueMicrotask(() => {
      if (this.#labelEl.textContent) return;
      if (this.#controlEl.getAttribute('aria-label')) return;
      if (this.#controlEl.getAttribute('aria-labelledby')) return;
      console.error(`${this.tagName.toLowerCase()}: icon-only button has no accessible name — set "label" or "aria-label".`);
    });
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
