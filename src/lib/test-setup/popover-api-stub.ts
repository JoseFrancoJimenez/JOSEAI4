// AWESOME AI

// Test infrastructure only — never shipped (CLAUDE.md: no polyfills in library code).
//
// Task 1 of docs/tasks/popover/pop-over.md found jsdom (pinned ^30.0.1) implements none of
// the Popover API: showPopover/hidePopover/togglePopover are undefined, there is no
// ToggleEvent, and `:popover-open` never matches (confirmed against jsdom directly, not
// through this file). This stub exists only so widget-popover's tests can drive
// show/hide/toggle and read `this.matches(':popover-open')`, per the "not supported at all"
// branch of Task 1. Registered as a Vitest setupFile for the "lib" project only.
//
// Not covered here, because jsdom performs no layout and focus() ignores display entirely:
// a closed popover's content is not made unfocusable by this stub. That assertion is a
// manual pass — docs/tasks/popover/pop-over.md §11.

const openHosts = new WeakSet<Element>();

class StubToggleEvent extends Event {
  readonly oldState: string;
  readonly newState: string;

  constructor(type: string, init: { oldState: string; newState: string; cancelable?: boolean }) {
    super(type, { cancelable: init.cancelable ?? false });
    this.oldState = init.oldState;
    this.newState = init.newState;
  }
}

if (typeof globalThis.ToggleEvent === 'undefined') {
  // @ts-expect-error -- lib.dom.d.ts declares ToggleEvent; jsdom does not implement it yet.
  globalThis.ToggleEvent = StubToggleEvent;
}

function setOpen(el: Element, open: boolean): void {
  const oldState = openHosts.has(el) ? 'open' : 'closed';
  const newState = open ? 'open' : 'closed';
  if (oldState === newState) return;

  el.dispatchEvent(new StubToggleEvent('beforetoggle', { oldState, newState, cancelable: true }));
  if (open) openHosts.add(el);
  else openHosts.delete(el);
  el.dispatchEvent(new StubToggleEvent('toggle', { oldState, newState }));
}

if (typeof HTMLElement.prototype.showPopover !== 'function') {
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      if (openHosts.has(this)) throw new DOMException('showPopover: already showing', 'InvalidStateError');
      setOpen(this, true);
    },
    hidePopover(this: HTMLElement) {
      if (!openHosts.has(this)) return;
      setOpen(this, false);
    },
    togglePopover(this: HTMLElement, force?: boolean) {
      const open = force ?? !openHosts.has(this);
      if (open) this.showPopover();
      else this.hidePopover();
    },
  });
}

type StubbedMatches = typeof Element.prototype.matches & { __popoverStub?: boolean };

if (!(Element.prototype.matches as StubbedMatches).__popoverStub) {
  // Read via a property descriptor, not a direct member reference: the latter is a "method"
  // as far as @typescript-eslint/unbound-method is concerned, even though it is only ever
  // invoked below through `.call`.
  const nativeMatches = Object.getOwnPropertyDescriptor(Element.prototype, 'matches')!.value as (
    this: Element,
    selector: string,
  ) => boolean;

  const patched = function (this: Element, selector: string): boolean {
    if (selector === ':popover-open') return openHosts.has(this);
    return nativeMatches.call(this, selector);
  } as unknown as StubbedMatches;
  patched.__popoverStub = true;
  Element.prototype.matches = patched;
}
