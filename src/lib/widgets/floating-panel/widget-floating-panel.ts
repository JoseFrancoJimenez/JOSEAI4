// AWESOME AI

// APG pattern: none, deliberately. This is a container of content, not a widget with composite
// interaction — it has no keyboard model of its own beyond Escape, and its contents keep their
// own focus models (docs/accessibility.md §3.2). role="region" was considered and rejected: it
// would demand an accessible name the consumer may not have (docs/accessibility.md §4), and a
// landmark for a transient tool panel is noise. No ARIA is better than wrong ARIA
// (docs/accessibility.md §1; docs/tasks/popover/widget-floating-panel-plan.md §9).

import './widget-floating-panel.css';
import { cls, regionNames } from './widget-floating-panel-dom.ts';
import { fillRegion, harvestRegions } from '../../core/regions.ts';
import type { HarvestedRegions, RegionContent } from '../../core/regions.ts';
import { UiCardElement } from '../../elements/ui-card/ui-card.ts';
import { UiButtonElement } from '../../elements/ui-button/ui-button.ts';

type WidgetFloatingPanelRegion = (typeof regionNames)[number];

const UPGRADE_PROPS = ['open'] as const;

const DEV: boolean = import.meta.env.DEV;

/**
 * The group-sibling decision (Task 5), extracted so it is asserted without touching the DOM
 * at all: every candidate except `self` that is currently open. Selection of the candidates
 * themselves (which elements share a group) stays in `#closeGroupSiblings`, where the DOM is.
 */
function siblingsToClose<T extends { open: boolean }>(candidates: readonly T[], self: T): T[] {
  return candidates.filter((c) => c !== self && c.open);
}

/**
 * Walks `el`'s ancestors looking for a `position` other than `static` (§7). Not `el.offsetParent`:
 * that getter answers a layout question ("what box resolves my offsets"), and jsdom — which
 * performs no layout (`docs/testing.md` §3) — hard-codes it to `null` unconditionally, which
 * would make this guard fire on every open in tests and the "has a positioned ancestor" case
 * untestable. A computed-style walk asks the same question this widget actually cares about
 * (is there a `position`'d ancestor at all) without needing real geometry, so jsdom answers it
 * correctly from the cascade alone.
 */
function hasPositionedAncestor(el: Element): boolean {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).position !== 'static') return true;
  }
  return false;
}

/**
 * `<widget-floating-panel>` — a non-modal floating panel, positioned with container-relative
 * `position: absolute` rather than the platform Popover API (`docs/rationale.md` "Popover API
 * replaced by container-relative positioning"; `docs/tasks/popover/widget-floating-panel-plan.md`
 * §7). Composes `ui-card` for its frame and `ui-button` for its close control. No `setup()`: fully
 * configurable by attributes and content regions, so there is no readiness gate to build.
 *
 * `open` is a reflecting attribute and the single source of truth (§2); `show()` / `hide()` /
 * `toggle()` are thin wrappers around it. Containment and clipping are the consumer's job via
 * CSS — `position` and `overflow` on an ancestor — the widget itself does no clamping (§7, §14).
 */
class WidgetFloatingPanelElement extends HTMLElement {
  static observedAttributes = ['open'];

  #rendered = false;
  #harvested = false;
  #harvestedRegions: HarvestedRegions = new Map();
  #stash = new Map<WidgetFloatingPanelRegion, RegionContent>();

  #cardEl!: UiCardElement;
  #closeButtonEl!: UiButtonElement;
  #liveEl!: HTMLDivElement;

  #controller: AbortController | undefined;
  #source: HTMLElement | undefined;
  #positionAncestorChecked = false;

  /** `open` is a reflecting, observed attribute and the single source of truth (§2). */
  get open(): boolean {
    return this.hasAttribute('open');
  }

  set open(value: boolean) {
    this.toggleAttribute('open', value);
  }

  connectedCallback(): void {
    this.classList.add(cls.host);
    // Programmatic focus target only — `-1` keeps it out of sequential Tab order, so this adds no
    // extra Tab stop. Opening moves focus here (attributeChangedCallback below) so keyboard users
    // land on the panel immediately and Tab into its content, close button included, from there.
    this.setAttribute('tabindex', '-1');
    for (const prop of UPGRADE_PROPS) this.#upgradeProperty(prop);
    if (!this.#controller) {
      this.#controller = new AbortController();
      const { signal } = this.#controller;
      this.addEventListener('keydown', this.#onKeydown, { signal });
    }
    if (!this.#harvested) {
      this.#harvestedRegions = harvestRegions(this, regionNames);
      this.#harvested = true;
    }
    this.#render();
  }

  /** A move (disconnect + reconnect) leaves the listeners in place; only a real removal aborts them. */
  disconnectedCallback(): void {
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.#controller?.abort();
      this.#controller = undefined;
    });
  }

  /**
   * Reacts to `open` changing, whether through the property, `setAttribute`, or initial markup.
   * `toggleAttribute` (the property setter) is already a no-op when the attribute already
   * matches the target state, so a genuinely redundant call never reaches here (§2 "guard
   * re-entry"). Guarded on `#rendered` the same way `attributeChangedCallback` is everywhere
   * else in this repo — pre-render state is picked up by `#render()` itself.
   */
  attributeChangedCallback(): void {
    if (!this.#rendered || !this.open) return;
    this.#warnIfNoPositionedAncestor();
    this.#closeGroupSiblings();
    this.focus();
  }

  /** Opening moves focus to the panel itself (`attributeChangedCallback`); `source` is captured only to know where to return it on close. */
  show(source?: HTMLElement): void {
    if (this.open) return;
    this.#source = source;
    this.open = true;
  }

  /**
   * Focus restoration collapses into this one place (§8): capture whether the panel held focus
   * *before* removing `open` takes the content out of the accessibility tree, then restore
   * synchronously in the same call. `#source` optional. With no source (or a disconnected one),
   * the old platform `hidePopover()` guaranteed focus moved out of the removed top-layer content
   * on its own; owning `hide()` ourselves means that guarantee is ours to keep, so the previously
   * focused element is blurred explicitly rather than left stranded inside now-hidden content.
   */
  hide(): void {
    if (!this.open) return;
    const activeElement = document.activeElement as HTMLElement | null;
    const hadFocus = activeElement !== null && this.contains(activeElement);
    this.open = false;
    if (!hadFocus) return;
    if (this.#source?.isConnected) this.#source.focus();
    else activeElement?.blur();
  }

  toggle(source?: HTMLElement): void {
    if (this.open) this.hide();
    else this.show(source);
  }

  /**
   * A coordinate is not state (§4): writes custom properties only — the placement rule stays in
   * CSS. Coordinates are relative to the offset parent, not the viewport (§7, a contract
   * change from the top-layer version) — containment is the consumer's job, not ours.
   */
  positionAt(x: number, y: number): void {
    this.style.setProperty('--widget-floating-panel-x', `${x}px`);
    this.style.setProperty('--widget-floating-panel-y', `${y}px`);
  }

  /** Moves a value written before class registration off the instance so the prototype accessor takes over. */
  #upgradeProperty(prop: (typeof UPGRADE_PROPS)[number]): void {
    if (!Object.hasOwn(this, prop)) return;
    const bag = this as unknown as Record<string, unknown>;
    const value = bag[prop];
    delete bag[prop];
    bag[prop] = value;
  }

  /**
   * Dev-only, checked once per instance on its first open (§7): no positioned ancestor means
   * `positionAt()` coordinates resolve against the page, not a container — the most likely
   * integration mistake, and otherwise silent. Stripped in production.
   */
  #warnIfNoPositionedAncestor(): void {
    if (!DEV || this.#positionAncestorChecked) return;
    this.#positionAncestorChecked = true;
    if (!hasPositionedAncestor(this)) {
      console.error(
        `${this.tagName.toLowerCase()}: no positioned ancestor — positionAt() coordinates will resolve against the page. Give a containing element "position: relative" (or similar).`,
      );
    }
  }

  /** Selecting the candidates (which elements share a group) is the DOM part; the decision itself is `siblingsToClose`, tested DOM-free. */
  #closeGroupSiblings(): void {
    const group = this.getAttribute('group');
    if (!group) return;
    const candidates = Array.from(document.querySelectorAll<WidgetFloatingPanelElement>(`.${cls.host}[group="${group}"]`));
    for (const sibling of siblingsToClose(candidates, this)) sibling.hide();
  }

  /** Only a user gesture emits (close button, `Escape`) — commands stay silent (`docs/testing.md` §4). */
  #emitToggle(): void {
    this.dispatchEvent(new CustomEvent('widget-floating-panel:toggle', { detail: { open: this.open }, bubbles: true }));
  }

  /** Listening on the host, not `document`, is the whole implementation of "only when focus is inside" (§8). */
  #onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    this.hide();
    this.#emitToggle();
  };

  /**
   * Input provisioning, not a command (skill §5): exempt from any readiness check, never throws.
   * Before render it stashes; at fill time the stash applies; after render it applies immediately.
   * An unknown region name is ignored.
   */
  setContent(region: WidgetFloatingPanelRegion, content: RegionContent): void {
    if (!(regionNames as readonly string[]).includes(region)) return;

    if (!this.#rendered) {
      this.#stash.set(region, content);
      return;
    }
    this.#apply(region, content);
  }

  /** Renders the skeleton once. Guarded so a DOM move (disconnect + reconnect) does not re-render. */
  #render(): void {
    if (this.#rendered) return;
    this.innerHTML = this.#html();
    this.#cardEl = this.querySelector<UiCardElement>(`.${cls.card}`)!;

    this.#closeButtonEl = this.#buildCloseButton();
    this.#closeButtonEl.addEventListener('click', () => {
      this.hide();
      this.#emitToggle();
    });
    this.#liveEl = this.#buildLiveWrapper();
    this.#cardEl.setContent('default', this.#liveEl);

    this.#rendered = true;
    this.#fill();
  }

  /**
   * Applies stashed `setContent` calls and harvested markup, stash taking precedence
   * (`docs/regions.md` §6 precedence). `header` always applies — even with no content on either
   * side — because the close button must always render (§5).
   */
  #fill(): void {
    this.#applyHeader(this.#consume('header'));
    const body = this.#consume('default');
    if (body !== undefined) fillRegion(this.#liveEl, body);
    const footer = this.#consume('footer');
    if (footer !== undefined) this.#cardEl.setContent('footer', footer);

    this.#stash.clear();
    this.#harvestedRegions.clear();
  }

  #consume(region: WidgetFloatingPanelRegion): RegionContent | undefined {
    return this.#stash.get(region) ?? this.#harvestedRegions.get(region);
  }

  #apply(region: WidgetFloatingPanelRegion, content: RegionContent): void {
    switch (region) {
      case 'header':
        this.#applyHeader(content);
        break;
      case 'default':
        fillRegion(this.#liveEl, content);
        break;
      case 'footer':
        this.#cardEl.setContent('footer', content);
        break;
    }
  }

  /**
   * Rebuilt on every write so the close button always survives (§5): a fresh fragment of
   * `[consumer content, closeButton]`, handed to the card in one `setContent` call.
   */
  #applyHeader(content: RegionContent | undefined): void {
    const fragment = document.createDocumentFragment();
    if (content !== undefined) fragment.append(content);
    fragment.append(this.#closeButtonEl);
    this.#cardEl.setContent('header', fragment);
  }

  #html(): string {
    return `<ui-card class="${cls.card}"></ui-card>`;
  }

  /** Icon-only, so its accessible name comes from `close-label` (default `'Close'`) rather than visible text. */
  #buildCloseButton(): UiButtonElement {
    const button = document.createElement('ui-button');
    button.classList.add(cls.close);
    button.icon = 'fa-solid fa-xmark';
    button.setAttribute('aria-label', this.getAttribute('close-label') ?? 'Close');
    return button;
  }

  /**
   * Persistent across the widget's lifetime: a live region must exist before its content
   * changes, so this wrapper is handed to the card once and filled in place, never replaced
   * (`docs/tasks/popover/widget-floating-panel-plan.md` §6).
   */
  #buildLiveWrapper(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add(cls.live);
    wrapper.setAttribute('aria-live', 'polite');
    return wrapper;
  }
}

if (!customElements.get('widget-floating-panel')) customElements.define('widget-floating-panel', WidgetFloatingPanelElement);

declare global {
  interface HTMLElementTagNameMap {
    'widget-floating-panel': WidgetFloatingPanelElement;
  }
}

export { WidgetFloatingPanelElement, siblingsToClose };
export type { WidgetFloatingPanelRegion };
