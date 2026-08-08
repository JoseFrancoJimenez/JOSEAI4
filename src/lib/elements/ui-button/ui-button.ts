// AWESOME AI

import './ui-button.css';
import { cls } from './ui-button-dom.ts';

type UiButtonType = 'button' | 'submit' | 'reset';
type UiButtonIconPosition = 'start' | 'end';

const UPGRADE_PROPS = ['label', 'icon', 'iconPosition', 'type', 'disabled'] as const;

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
    return ['label', 'icon', 'type', 'disabled', 'aria-label', 'aria-labelledby'];
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

  connectedCallback(): void {
    this.classList.add(cls.host);
    for (const prop of UPGRADE_PROPS) this.#upgradeProperty(prop);
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
      case 'aria-label':
      case 'aria-labelledby':
        this.#applyAccessibleName();
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
    this.#labelEl.textContent = this.label;
    this.#setIcon(this.icon);
    this.#applyAccessibleName();

    this.#rendered = true;
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

  /** Forwards a consumer-supplied `aria-label`/`aria-labelledby` from the (non-focusable) host to the inner control. */
  #applyAccessibleName(): void {
    const label = this.getAttribute('aria-label');
    if (label !== null) this.#controlEl.setAttribute('aria-label', label);
    else this.#controlEl.removeAttribute('aria-label');

    const labelledby = this.getAttribute('aria-labelledby');
    if (labelledby !== null) this.#controlEl.setAttribute('aria-labelledby', labelledby);
    else this.#controlEl.removeAttribute('aria-labelledby');
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
