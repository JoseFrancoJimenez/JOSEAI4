// AWESOME AI

import './ui-button.css';
import { fillRegion, harvestRegions } from '../../core/regions.ts';
import type { HarvestedRegions, RegionContent } from '../../core/regions.ts';
import { cls, regionNames } from './ui-button-dom.ts';
import type { UiButtonRegion } from './ui-button-dom.ts';

type UiButtonType = 'button' | 'submit' | 'reset';
type UiButtonIconPosition = 'start' | 'end';

const UPGRADE_PROPS = ['label', 'icon', 'iconPosition', 'type', 'disabled'] as const;

const DEV: boolean = import.meta.env.DEV;

/**
 * `<ui-button>` — APG pattern: Button.
 *
 * Renders a real `<button>` in light DOM with an icon region and a label region. Pure view: no
 * state, no `setup()` — it renders immediately on connect with safe defaults.
 */
class UiButtonElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['label', 'icon', 'icon-position', 'type', 'disabled'];
  }

  #rendered = false;
  #harvested = false;
  #regions: HarvestedRegions | null = null;
  #pendingContent = new Map<UiButtonRegion, RegionContent>();

  #controlEl!: HTMLButtonElement;
  #iconOutlet!: HTMLElement;
  #labelOutlet!: HTMLElement;

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
    for (const prop of UPGRADE_PROPS) this.#upgradeProperty(prop);

    if (!this.#harvested) {
      this.#regions = harvestRegions(this);
      this.#harvested = true;
    }
    this.#render();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.#rendered) return;

    switch (name) {
      case 'label':
        if (value) fillRegion(this.#labelOutlet, value);
        break;
      case 'icon':
        if (value) fillRegion(this.#iconOutlet, this.#buildIconNode(value));
        break;
      case 'type':
        this.#controlEl.type = this.type;
        break;
      case 'disabled':
        this.#controlEl.disabled = this.disabled;
        break;
    }
  }

  /**
   * Fills `region` with `content`. Input provisioning, not a command: never throws, ignores an
   * unknown region name, stashes before render and applies immediately after.
   */
  setContent(region: UiButtonRegion, content: RegionContent): void {
    if (!regionNames.includes(region)) return;
    if (!this.#rendered) {
      this.#pendingContent.set(region, content);
      return;
    }
    fillRegion(this.#outletFor(region)!, content);
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
    this.#iconOutlet = this.querySelector<HTMLElement>('[data-outlet="icon"]')!;
    this.#labelOutlet = this.querySelector<HTMLElement>('[data-outlet="default"]')!;

    this.#controlEl.type = this.type;
    this.#controlEl.disabled = this.disabled;
    this.#applyAccessibleName();

    // Precedence at first render: attribute default < harvested markup < explicit setContent stash.
    this.#applyAttributeDefaults();
    this.#applyHarvested();
    this.#applyPendingContent();

    this.#rendered = true;

    if (DEV) this.#scheduleAccessibleNameCheck();
  }

  #html(): string {
    return `<button type="button" class="${cls.control}">
      <span class="${cls.icon}" data-outlet="icon" aria-hidden="true"></span>
      <span class="${cls.label}" data-outlet="default"></span>
    </button>`;
  }

  /** `label`/`icon` attribute values, weakest source — a harvested region for the same outlet overrides them. */
  #applyAttributeDefaults(): void {
    if (this.label) fillRegion(this.#labelOutlet, this.label);
    if (this.icon) fillRegion(this.#iconOutlet, this.#buildIconNode(this.icon));
  }

  #applyHarvested(): void {
    if (!this.#regions) return;
    for (const [name, fragment] of this.#regions) {
      const outlet = this.#outletFor(name as UiButtonRegion);
      if (outlet) fillRegion(outlet, fragment);
    }
  }

  #applyPendingContent(): void {
    for (const [region, content] of this.#pendingContent) {
      const outlet = this.#outletFor(region);
      if (outlet) fillRegion(outlet, content);
    }
    this.#pendingContent.clear();
  }

  /** Forwards a consumer-supplied `aria-label`/`aria-labelledby` from the (non-focusable) host to the inner control. */
  #applyAccessibleName(): void {
    const label = this.getAttribute('aria-label');
    if (label !== null) this.#controlEl.setAttribute('aria-label', label);

    const labelledby = this.getAttribute('aria-labelledby');
    if (labelledby !== null) this.#controlEl.setAttribute('aria-labelledby', labelledby);
  }

  /**
   * Dev-only: one microtask after render, flags an icon-only button with no accessible name.
   * Deferred so a `setContent('default', …)` called right after connect isn't a false positive.
   */
  #scheduleAccessibleNameCheck(): void {
    queueMicrotask(() => {
      if (this.#labelOutlet.childNodes.length > 0) return;
      if (this.#controlEl.hasAttribute('aria-label') || this.#controlEl.hasAttribute('aria-labelledby')) return;
      console.error(`${this.tagName.toLowerCase()}: icon-only button has no accessible name — set "label", "aria-label", or "aria-labelledby".`);
    });
  }

  #outletFor(region: UiButtonRegion): HTMLElement | null {
    if (region === 'icon') return this.#iconOutlet;
    if (region === 'default') return this.#labelOutlet;
    return null;
  }

  #buildIconNode(classNames: string): HTMLElement {
    const icon = document.createElement('i');
    icon.className = classNames;
    return icon;
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
