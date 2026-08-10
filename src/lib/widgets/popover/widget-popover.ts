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

const UPGRADE_PROPS = ['clampTo'] as const;

/**
 * The group-sibling decision (Task 5), extracted so it is asserted without touching the DOM
 * at all: every candidate except `self` that is currently open. Selection of the candidates
 * themselves (which elements share a group) stays in `#onBeforeToggle`, where the DOM is.
 */
function siblingsToClose<T extends { open: boolean }>(candidates: readonly T[], self: T): T[] {
  return candidates.filter((c) => c !== self && c.open);
}

/**
 * The clamp arithmetic (Task 7), extracted the same way `siblingsToClose` is: `#clampToBounds`
 * itself can't be exercised in a unit test — jsdom performs no layout, so `getBoundingClientRect`
 * always reports zeros — but this is plain min/max math over whatever rects it's handed, so it is
 * asserted directly, DOM-free. Pulls a `size`-sized box at (`x`, `y`) back inside `bounds`,
 * leaving `gap` of breathing room from whichever edge it would otherwise cross; falls back to
 * flush against the near edge when `size` alone is wider or taller than `bounds`.
 */
function clampToBounds(
  x: number,
  y: number,
  size: { width: number; height: number },
  bounds: { left: number; top: number; right: number; bottom: number },
  gap: number,
): { x: number; y: number } {
  const minX = bounds.left + gap;
  const minY = bounds.top + gap;
  const maxX = Math.max(minX, bounds.right - size.width - gap);
  const maxY = Math.max(minY, bounds.bottom - size.height - gap);
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

/**
 * `<widget-popover>` — a non-modal, top-layer floating panel built on the platform Popover API.
 * Composes `ui-card` for its frame and `ui-button` for its close control. No `setup()`: fully
 * configurable by attributes and content regions, so there is no readiness gate to build
 * (`docs/tasks/popover/pop-over.md` §2).
 *
 * This is through Task 7: skeleton, card composition, region forwarding, the close button
 * wired to `hide()`, open/close, focus restoration, Escape, group auto-close, positioning, and
 * a boundary clamp on top of `positionAt` so it never renders outside `clampTo` (viewport by
 * default) — never off any edge, not just the right/bottom.
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
  #clampTo: Element | null = null;

  /** `this.matches(':popover-open')` — the platform is the source of truth, never mirrored (§2). */
  get open(): boolean {
    return this.matches(':popover-open');
  }

  /**
   * Set once to constrain every future `show()`/`positionAt()` to this element's bounds instead
   * of the viewport — e.g. a map div a click-positioned feature popup should never spill out of.
   * Rich data (an `Element` reference), so a property, not an attribute (skill §6). `null` (the
   * default) restores the viewport-only clamp.
   */
  get clampTo(): Element | null {
    return this.#clampTo;
  }

  set clampTo(value: Element | null) {
    this.#clampTo = value;
  }

  // `open` has no upgrade: it is a read-only getter backed by `:popover-open`. `group`/
  // `close-label` are plain, unobserved attributes read at the moment they matter.
  connectedCallback(): void {
    this.classList.add(cls.host);
    this.setAttribute('popover', 'manual');
    for (const prop of UPGRADE_PROPS) this.#upgradeProperty(prop);
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
    this.#clampToBounds();
  }

  hide(): void {
    this.hidePopover();
  }

  /** Reads current state, per §2, rather than delegating to the platform's own toggle. */
  toggle(source?: HTMLElement): void {
    if (this.open) this.hide();
    else this.show(source);
  }

  /**
   * A coordinate is not state (§4): writes custom properties — the placement rule stays in CSS.
   * Also re-clamps immediately when already open, so a caller that measures its own size *after*
   * `show()` (positioning beside an anchor whose width it doesn't know upfront) still gets pulled
   * back inside bounds on this call, not just on the next `show()`.
   */
  positionAt(x: number, y: number): void {
    this.style.setProperty('--widget-popover-x', `${x}px`);
    this.style.setProperty('--widget-popover-y', `${y}px`);
    if (this.open) this.#clampToBounds();
  }

  /**
   * Boundary clamp, not collision detection (§10): pulls a `positionAt`'d popover back inside
   * `clampTo`'s bounds (or the viewport, when `clampTo` is unset) — never flips sides, never
   * touches a popover placed by app CSS (`.tools` etc.), and does nothing at all when `positionAt`
   * was never called (the presence of the custom property is the signal, matching `positionAt`'s
   * own "no extra state" design). Measuring only works post-`showPopover()`, once the box has real
   * layout — this method itself is unverifiable in a unit test through the widget (jsdom performs
   * no layout), so the arithmetic lives in `clampToBounds` above, tested DOM-free; the whole thing
   * is checked in the sandbox the same way `--widget-popover-max-height` capping is (§6).
   */
  #clampToBounds(): void {
    if (this.style.getPropertyValue('--widget-popover-x') === '') return;

    const rect = this.getBoundingClientRect();
    const bounds = this.#clampTo?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const { x, y } = clampToBounds(rect.left, rect.top, rect, bounds, 8);
    if (x !== rect.left) this.style.setProperty('--widget-popover-x', `${x}px`);
    if (y !== rect.top) this.style.setProperty('--widget-popover-y', `${y}px`);
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

export { WidgetPopoverElement, siblingsToClose, clampToBounds };
export type { WidgetPopoverRegion };
