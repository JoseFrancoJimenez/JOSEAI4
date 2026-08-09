// AWESOME AI

// APG pattern: none, deliberately. The platform's popover semantics already describe this
// element to assistive tech; layering role="dialog" or aria-modal on top duplicates them
// (docs/tasks/popover/pop-over.md §7).

import './widget-popover.css';
import { cls, regionNames } from './widget-popover-dom.ts';
import { fillRegion, harvestRegions } from '../../core/regions.ts';
import type { HarvestedRegions, RegionContent } from '../../core/regions.ts';
import { UiCardElement } from '../../elements/ui-card/ui-card.ts';
import { UiButtonElement } from '../../elements/ui-button/ui-button.ts';

type WidgetPopoverRegion = (typeof regionNames)[number];

/**
 * The group-sibling decision (Task 5), extracted so it is asserted without touching the DOM
 * at all: every candidate except `self` that is currently open. Selection of the candidates
 * themselves (which elements share a group) stays in `#onBeforeToggle`, where the DOM is.
 */
function siblingsToClose<T extends { open: boolean }>(candidates: readonly T[], self: T): T[] {
  return candidates.filter((c) => c !== self && c.open);
}

/**
 * `<widget-popover>` — a non-modal, top-layer floating panel built on the platform Popover API.
 * Composes `ui-card` for its frame and `ui-button` for its close control. No `setup()`: fully
 * configurable by attributes and content regions, so there is no readiness gate to build
 * (`docs/tasks/popover/pop-over.md` §2).
 *
 * This is through Task 7: skeleton, card composition, region forwarding, the close button
 * wired to `hide()`, open/close, focus restoration, Escape, group auto-close, positioning, and
 * a viewport clamp on top of `positionAt` so it never renders off the right or bottom edge.
 */
class WidgetPopoverElement extends HTMLElement {
  #rendered = false;
  #harvested = false;
  #harvestedRegions: HarvestedRegions = new Map();
  #stash = new Map<WidgetPopoverRegion, RegionContent>();

  #cardEl!: UiCardElement;
  #closeButtonEl!: UiButtonElement;
  #liveEl!: HTMLDivElement;

  #controller: AbortController | undefined;
  #source: HTMLElement | undefined;
  #restoreFocus = false;

  /** `this.matches(':popover-open')` — the platform is the source of truth, never mirrored (§2). */
  get open(): boolean {
    return this.matches(':popover-open');
  }

  // No property upgrade: `open` is a read-only getter backed by `:popover-open`, and
  // `group`/`close-label` are plain, unobserved attributes read at the moment they matter.
  connectedCallback(): void {
    this.classList.add(cls.host);
    this.setAttribute('popover', 'manual');
    if (!this.#controller) {
      this.#controller = new AbortController();
      const { signal } = this.#controller;
      this.addEventListener('beforetoggle', this.#onBeforeToggle, { signal });
      this.addEventListener('toggle', this.#onToggle, { signal });
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

  /** Opening never moves focus (§7); `source` is captured only to know where to return it on close. */
  show(source?: HTMLElement): void {
    this.#source = source;
    this.showPopover();
    this.#clampToViewport();
  }

  hide(): void {
    this.hidePopover();
  }

  /** Reads current state, per §2, rather than delegating to the platform's own toggle. */
  toggle(source?: HTMLElement): void {
    if (this.open) this.hide();
    else this.show(source);
  }

  /** A coordinate is not state (§4): writes custom properties, nothing else — the placement rule stays in CSS. */
  positionAt(x: number, y: number): void {
    this.style.setProperty('--widget-popover-x', `${x}px`);
    this.style.setProperty('--widget-popover-y', `${y}px`);
  }

  /**
   * Boundary clamp, not collision detection (§10): only pulls a `positionAt`'d popover back when
   * it would render off the right or bottom edge — never flips sides, never touches a popover
   * placed by app CSS (`.tools` etc.), and does nothing at all when `positionAt` was never called
   * (the presence of the custom property is the signal, matching `positionAt`'s own "no extra
   * state" design). Measuring only works post-`showPopover()`, once the box has real layout —
   * jsdom performs no layout, so this is unverifiable in a unit test and is checked in the
   * sandbox instead, the same way `--widget-popover-max-height` capping is (§6).
   */
  #clampToViewport(): void {
    if (this.style.getPropertyValue('--widget-popover-x') === '') return;

    const gap = 8;
    const rect = this.getBoundingClientRect();
    const maxLeft = Math.max(gap, window.innerWidth - rect.width - gap);
    const maxTop = Math.max(gap, window.innerHeight - rect.height - gap);
    if (rect.left > maxLeft) this.style.setProperty('--widget-popover-x', `${maxLeft}px`);
    if (rect.top > maxTop) this.style.setProperty('--widget-popover-y', `${maxTop}px`);
  }

  /**
   * `beforetoggle` fires while `document.activeElement` is still meaningful; capture whether the
   * popover held focus before the platform moves it out of the top layer (`docs/accessibility.md`
   * §7 / skill §4 — wired here, not in `hide()`, so the invariant holds for a native close too).
   */
  #onBeforeToggle = (ev: ToggleEvent): void => {
    if (ev.newState === 'closed') {
      this.#restoreFocus = this.contains(document.activeElement);
      return;
    }
    const group = this.getAttribute('group');
    if (!group) return;
    const candidates = Array.from(document.querySelectorAll<WidgetPopoverElement>(`.${cls.host}[group="${group}"]`));
    for (const sibling of siblingsToClose(candidates, this)) sibling.hide();
  };

  /** `toggle` fires after the state change; restore focus only if the popover held it (§7). */
  #onToggle = (ev: ToggleEvent): void => {
    if (ev.newState === 'closed' && this.#restoreFocus) this.#source?.focus();
  };

  /** Listening on the host, not `document`, is the whole implementation of "only when focus is inside" (§7). */
  #onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    this.hide();
  };

  /**
   * Input provisioning, not a command (skill §5): exempt from any readiness check, never throws.
   * Before render it stashes; at fill time the stash applies; after render it applies immediately.
   * An unknown region name is ignored.
   */
  setContent(region: WidgetPopoverRegion, content: RegionContent): void {
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
    this.#closeButtonEl.addEventListener('click', () => this.hide());
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

  #consume(region: WidgetPopoverRegion): RegionContent | undefined {
    return this.#stash.get(region) ?? this.#harvestedRegions.get(region);
  }

  #apply(region: WidgetPopoverRegion, content: RegionContent): void {
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
   * (`docs/tasks/popover/pop-over.md` §6 — the fill itself lands in Task 3).
   */
  #buildLiveWrapper(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add(cls.live);
    wrapper.setAttribute('aria-live', 'polite');
    return wrapper;
  }
}

if (!customElements.get('widget-popover')) customElements.define('widget-popover', WidgetPopoverElement);

declare global {
  interface HTMLElementTagNameMap {
    'widget-popover': WidgetPopoverElement;
  }
}

export { WidgetPopoverElement, siblingsToClose };
export type { WidgetPopoverRegion };
