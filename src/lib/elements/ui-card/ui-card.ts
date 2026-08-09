// AWESOME AI

import './ui-card.css';
import { cls, regionNames } from './ui-card-dom.ts';
import { fillRegion, harvestRegions } from '../../core/regions.ts';
import type { HarvestedRegions, RegionContent } from '../../core/regions.ts';

type UiCardRegion = (typeof regionNames)[number];

/**
 * `<ui-card>` — no APG pattern: static container.
 *
 * A bordered container with three stacked sections — header, default (body), footer — each
 * filled by the consumer, from markup or from code. Pure view: no state, no `setup()`, renders
 * immediately on connect with three empty outlets.
 */
class UiCardElement extends HTMLElement {
  #rendered = false;
  #harvested = false;
  #harvestedRegions: HarvestedRegions = new Map();
  #stash = new Map<UiCardRegion, RegionContent>();
  #outlets = new Map<UiCardRegion, Element>();

  // No observedAttributes, no attributeChangedCallback, no #upgradeProperties: this component
  // has zero attributes and zero properties, so there is nothing to observe or upgrade.

  connectedCallback(): void {
    this.classList.add(cls.host);
    if (!this.#harvested) {
      this.#harvestedRegions = harvestRegions(this, regionNames);
      this.#harvested = true;
    }
    this.#render();
  }

  /**
   * Input provisioning, not a command (`docs/tasks/card/ui-card.md` §2): exempt from any
   * readiness gate, and it never throws. Before render it stashes; at fill time the stash
   * applies; after render it applies immediately. An unknown region name is ignored.
   */
  setContent(region: UiCardRegion, content: RegionContent): void {
    if (!(regionNames as readonly string[]).includes(region)) return;

    if (!this.#rendered) {
      this.#stash.set(region, content);
      return;
    }
    fillRegion(this.#outlets.get(region)!, content);
  }

  /** Renders the skeleton once. Guarded so a DOM move (disconnect + reconnect) does not re-render. */
  #render(): void {
    if (this.#rendered) return;
    this.innerHTML = this.#html();
    for (const name of regionNames) {
      this.#outlets.set(name, this.querySelector(`[data-outlet="${name}"]`)!);
    }
    this.#rendered = true;
    this.#fill();
  }

  #html(): string {
    return `<div class="${cls.header}" data-outlet="header"></div><div class="${cls.body}" data-outlet="default"></div><div class="${cls.footer}" data-outlet="footer"></div>`;
  }

  /**
   * Applies stashed `setContent` calls and harvested markup to each outlet, stash taking
   * precedence (§6 precedence: a pre-attach `setContent` beats the harvest that follows it).
   * A region neither stashed nor harvested is left as authored — empty, no default to fall back to.
   */
  #fill(): void {
    for (const name of regionNames) {
      const content = this.#stash.get(name) ?? this.#harvestedRegions.get(name);
      if (content !== undefined) fillRegion(this.#outlets.get(name)!, content);
    }
    this.#stash.clear();
    this.#harvestedRegions.clear();
  }
}

if (!customElements.get('ui-card')) customElements.define('ui-card', UiCardElement);

declare global {
  interface HTMLElementTagNameMap {
    'ui-card': UiCardElement;
  }
}

export { UiCardElement };
export type { UiCardRegion };
