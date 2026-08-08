// AWESOME AI

import './ui-button.css';
import { cls } from './ui-button-dom.ts';

/**
 * `<ui-button>` — APG pattern: Button.
 *
 * Renders a real `<button>` in light DOM with an icon span and a label span. Pure view: no
 * state, no `setup()`, no content regions — configured entirely by attributes and properties.
 * It renders immediately on connect with safe defaults.
 */
class UiButtonElement extends HTMLElement {
  #rendered = false;

  #controlEl!: HTMLButtonElement;
  #iconEl!: HTMLElement;
  #labelEl!: HTMLElement;

  connectedCallback(): void {
    this.classList.add(cls.host);
    this.#render();
  }

  /** Renders the skeleton once. Guarded so a DOM move (disconnect + reconnect) does not re-render. */
  #render(): void {
    if (this.#rendered) return;
    this.innerHTML = this.#html();
    this.#controlEl = this.querySelector<HTMLButtonElement>(`.${cls.control}`)!;
    this.#iconEl = this.querySelector<HTMLElement>(`.${cls.icon}`)!;
    this.#labelEl = this.querySelector<HTMLElement>(`.${cls.label}`)!;
    this.#rendered = true;
  }

  #html(): string {
    return `<button type="button" class="${cls.control}">
      <span class="${cls.icon}" aria-hidden="true"></span>
      <span class="${cls.label}"></span>
    </button>`;
  }
}

if (!customElements.get('ui-button')) customElements.define('ui-button', UiButtonElement);

declare global {
  interface HTMLElementTagNameMap {
    'ui-button': UiButtonElement;
  }
}

export { UiButtonElement };
