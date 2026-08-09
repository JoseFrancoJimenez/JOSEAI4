// AWESOME AI

// Task 1 spike (docs/tasks/popover/pop-over.md) — no production code below this comment block,
// per the task. Production tests for widget-popover itself start at "widget-popover skeleton
// (Task 2)" further down.
//
// FINDING: jsdom (pinned ^30.0.1 in this repo) implements NONE of the Popover API.
// `showPopover`/`hidePopover`/`togglePopover` are `undefined` on HTMLElement, there is no
// global `ToggleEvent`, and `el.matches(':popover-open')` never throws but never matches
// either (nwsapi silently treats the unknown pseudo-class as non-matching).
//
// Separately verified directly against jsdom (not through any stub): `focus()` ignores
// `display` entirely, whether inline or authored — an element inside a `display: none`
// ancestor still becomes `document.activeElement`. jsdom performs no layout
// (docs/testing.md §3), so this is not something a stub can fix.
//
// DECISION: branch 3, "not supported at all" (§ Task 1, item 3). Added the smallest
// possible stub — src/lib/test-setup/popover-api-stub.ts, wired as a Vitest setupFile for
// the "lib" project only (vitest.config.ts). It fakes showPopover/hidePopover/togglePopover
// and ToggleEvent, and patches `Element.prototype.matches` to special-case the literal
// string `':popover-open'` so the widget's `open` getter (`this.matches(':popover-open')`)
// is testable. It is labelled test infrastructure, not a polyfill, and never ships
// (CLAUDE.md: no polyfills in library code).
//
// Consequence for Task 4: "a hidden popover's contents are not focusable" cannot be
// asserted here — moved to the manual pass (docs/tasks/popover/pop-over.md §11).
//
// Consequence for Task 5: per this task's branch-3 instruction, the group-sibling decision
// (which open siblings to close) should be extracted as a small exported pure function, so
// that rule is asserted without depending on the DOM at all — not just without depending on
// the stub.

import { afterEach, describe, expect, it, vi } from 'vitest';
import './widget-popover.ts';
import { WidgetPopoverElement, siblingsToClose } from './widget-popover.ts';
import type { WidgetPopoverRegion } from './widget-popover.ts';

// The stub is loaded globally via vitest.config.ts's setupFiles for the "lib" project.

function mount(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('popover', 'manual');
  document.body.append(el);
  return el;
}

function mountWidget(html = '<widget-popover></widget-popover>'): WidgetPopoverElement {
  document.body.innerHTML = html;
  return document.body.querySelector('widget-popover') as WidgetPopoverElement;
}

function header(el: WidgetPopoverElement): Element {
  return el.querySelector('[data-outlet="header"]')!;
}

function body(el: WidgetPopoverElement): Element {
  return el.querySelector('[data-outlet="default"]')!;
}

function closeButtonNative(el: WidgetPopoverElement): HTMLButtonElement {
  return header(el).querySelector('.widget-popover__close')!.querySelector('button')!;
}

function mountWidgets(html: string): [WidgetPopoverElement, WidgetPopoverElement] {
  document.body.innerHTML = html;
  const els = Array.from(document.body.querySelectorAll('widget-popover'));
  return [els[0]!, els[1]!];
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('spike: jsdom Popover API support (via the stub)', () => {
  it('showPopover/hidePopover/togglePopover exist and do not throw', () => {
    const el = mount();
    expect(typeof el.showPopover).toBe('function');
    expect(typeof el.hidePopover).toBe('function');
    expect(typeof el.togglePopover).toBe('function');
    expect(() => el.showPopover()).not.toThrow();
    expect(() => el.hidePopover()).not.toThrow();
    expect(() => el.togglePopover()).not.toThrow();
  });

  it(':popover-open matches after showing', () => {
    const el = mount();
    el.showPopover();
    expect(el.matches(':popover-open')).toBe(true);
    el.hidePopover();
    expect(el.matches(':popover-open')).toBe(false);
  });

  it('beforetoggle and toggle fire on the element with oldState/newState', () => {
    const el = mount();
    const beforetoggleEvents: Array<{ oldState: string; newState: string }> = [];
    const toggleEvents: Array<{ oldState: string; newState: string }> = [];

    el.addEventListener('beforetoggle', (ev) => {
      beforetoggleEvents.push({ oldState: ev.oldState, newState: ev.newState });
    });
    el.addEventListener('toggle', (ev) => {
      toggleEvents.push({ oldState: ev.oldState, newState: ev.newState });
    });

    el.showPopover();
    el.hidePopover();

    expect(beforetoggleEvents).toEqual([
      { oldState: 'closed', newState: 'open' },
      { oldState: 'open', newState: 'closed' },
    ]);
    expect(toggleEvents).toEqual([
      { oldState: 'closed', newState: 'open' },
      { oldState: 'open', newState: 'closed' },
    ]);
  });
});

describe('widget-popover skeleton (Task 2)', () => {
  it('renders when instantiated from HTML', () => {
    const el = mountWidget();
    expect(el.querySelectorAll('ui-card').length).toBe(1);
  });

  it('renders when instantiated programmatically', () => {
    const el = document.createElement('widget-popover');
    document.body.append(el);
    expect(el.querySelectorAll('ui-card').length).toBe(1);
  });

  it('carries popover="manual" on the host', () => {
    const el = mountWidget();
    expect(el.getAttribute('popover')).toBe('manual');
  });

  it('the close button is inside the card header and has an accessible name', () => {
    const el = mountWidget();
    const closeButton = header(el).querySelector('.widget-popover__close')!;
    expect(closeButton).not.toBeNull();
    expect(closeButton.tagName.toLowerCase()).toBe('ui-button');
    expect(closeButton.getAttribute('aria-label')).toBe('Close');
  });

  it('close-label overrides the close button default accessible name', () => {
    const el = mountWidget('<widget-popover close-label="Dismiss"></widget-popover>');
    const closeButton = header(el).querySelector('.widget-popover__close')!;
    expect(closeButton.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('the live wrapper exists in the body outlet with aria-live="polite"', () => {
    const el = mountWidget();
    const live = body(el).querySelector('.widget-popover__live')!;
    expect(live).not.toBeNull();
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('a move (remove, re-append, flush a microtask) does not re-render or re-harvest', async () => {
    const el = mountWidget();
    const card = el.querySelector('ui-card');
    const closeButton = header(el).querySelector('.widget-popover__close');

    el.remove();
    document.body.append(el);
    await Promise.resolve();

    expect(el.querySelector('ui-card')).toBe(card);
    expect(header(el).querySelector('.widget-popover__close')).toBe(closeButton);
    expect(el.querySelectorAll('ui-card').length).toBe(1);
  });
});

describe('widget-popover region forwarding (Task 3)', () => {
  it('data-region="header" content lands in the header, with the close button still present', () => {
    const el = mountWidget('<widget-popover><span data-region="header">Layers</span></widget-popover>');
    expect(header(el).textContent).toContain('Layers');
    expect(header(el).querySelector('.widget-popover__close')).not.toBeNull();
  });

  it('data-region="footer" content is forwarded to the card footer', () => {
    const el = mountWidget('<widget-popover><span data-region="footer">Actions</span></widget-popover>');
    const footer = el.querySelector('[data-outlet="footer"]')!;
    expect(footer.textContent).toContain('Actions');
  });

  it('bare text content lands in the live wrapper, inside the body outlet', () => {
    const el = mountWidget('<widget-popover>Nothing selected</widget-popover>');
    const live = body(el).querySelector('.widget-popover__live')!;
    expect(live.textContent).toBe('Nothing selected');
  });
});

describe('widget-popover setContent (Task 3)', () => {
  it('setContent("header", ...) after render replaces the content and preserves the close button', () => {
    const el = mountWidget();

    el.setContent('header', 'Title');
    expect(header(el).textContent).toContain('Title');
    expect(header(el).querySelector('.widget-popover__close')).not.toBeNull();

    el.setContent('header', 'Other');
    expect(header(el).textContent).toContain('Other');
    expect(header(el).textContent).not.toContain('Title');
    expect(header(el).querySelector('.widget-popover__close')).not.toBeNull();
  });

  it('setContent("default", ...) writes inside the live wrapper; the wrapper is the same node before and after', () => {
    const el = mountWidget();
    const live = body(el).querySelector('.widget-popover__live')!;

    el.setContent('default', 'Feature info');

    expect(body(el).querySelector('.widget-popover__live')).toBe(live);
    expect(live.textContent).toBe('Feature info');
  });

  it('setContent("default", "") clears the wrapper without removing it', () => {
    const el = mountWidget();
    const live = body(el).querySelector('.widget-popover__live')!;
    el.setContent('default', 'Feature info');

    el.setContent('default', '');

    expect(body(el).querySelector('.widget-popover__live')).toBe(live);
    expect(live.textContent).toBe('');
  });

  it('setContent("default", ...) never parses a string as HTML', () => {
    const el = mountWidget();
    el.setContent('default', '<b>x</b>');
    const live = body(el).querySelector('.widget-popover__live')!;
    expect(live.querySelector('b')).toBeNull();
    expect(live.textContent).toBe('<b>x</b>');
  });
});

describe('widget-popover close button and region errors (Task 3)', () => {
  it('a ui-button supplied in the header region is connected and functional after render', () => {
    const el = mountWidget(
      '<widget-popover><ui-button data-region="header" label="Pin"></ui-button></widget-popover>',
    );
    const suppliedButton = header(el).querySelector('ui-button:not(.widget-popover__close)')!;
    expect(suppliedButton.isConnected).toBe(true);

    let clicked = false;
    suppliedButton.addEventListener('click', () => {
      clicked = true;
    });
    suppliedButton.querySelector('button')!.click();
    expect(clicked).toBe(true);
  });

  it('clicking the close button hides the popover, with no double toggle', () => {
    const el = mountWidget();
    el.showPopover();
    expect(el.matches(':popover-open')).toBe(true);

    const toggleEvents: string[] = [];
    el.addEventListener('toggle', () => toggleEvents.push('toggle'));

    const closeButton = header(el).querySelector('.widget-popover__close')!;
    closeButton.querySelector('button')!.click();

    expect(el.matches(':popover-open')).toBe(false);
    expect(toggleEvents).toEqual(['toggle']);
  });

  it('an unknown region name passed to setContent is ignored without throwing', () => {
    const el = mountWidget();
    expect(() => el.setContent('bogus' as WidgetPopoverRegion, 'x')).not.toThrow();
  });

  it('an unknown harvested region name produces the helper\'s dev error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mountWidget('<widget-popover><span data-region="typo">x</span></widget-popover>');

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('widget-popover open, close, toggle (Task 4)', () => {
  it('show() opens and open reports true', () => {
    const el = mountWidget();
    el.show();
    expect(el.open).toBe(true);
  });

  it('hide() closes', () => {
    const el = mountWidget();
    el.show();
    el.hide();
    expect(el.open).toBe(false);
  });

  it('toggle() does both', () => {
    const el = mountWidget();
    el.toggle();
    expect(el.open).toBe(true);
    el.toggle();
    expect(el.open).toBe(false);
  });
});

describe('widget-popover focus restoration (Task 4)', () => {
  it('show() does not move focus into the popover', () => {
    const el = mountWidget();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    el.show();

    expect(document.activeElement).toBe(outside);
  });

  it('with focus inside, hide() returns focus to source', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    closeButtonNative(el).focus();
    expect(el.contains(document.activeElement)).toBe(true);

    el.hide();

    expect(document.activeElement).toBe(source);
  });

  it('with focus outside, hide() leaves focus where it is', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);
    const outside = document.createElement('button');
    document.body.append(outside);

    el.show(source);
    outside.focus();

    el.hide();

    expect(document.activeElement).toBe(outside);
  });

  it('with no source, closing does not throw', () => {
    const el = mountWidget();
    el.show();
    closeButtonNative(el).focus();

    expect(() => el.hide()).not.toThrow();
  });

  it('with a source no longer connected, closing does not throw', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    source.remove();
    closeButtonNative(el).focus();

    expect(() => el.hide()).not.toThrow();
  });
});

describe('widget-popover Escape and native events (Task 4)', () => {
  it('Escape from inside closes and restores focus to source', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    closeButtonNative(el).focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    closeButtonNative(el).dispatchEvent(escape);

    expect(el.open).toBe(false);
    expect(document.activeElement).toBe(source);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('Escape dispatched outside the popover does nothing', () => {
    const el = mountWidget();
    el.show();
    const outside = document.createElement('button');
    document.body.append(outside);

    outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(el.open).toBe(true);
  });

  it('a key the widget does not handle is not preventDefaulted', () => {
    const el = mountWidget();
    el.show();
    const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });

    closeButtonNative(el).dispatchEvent(other);

    expect(other.defaultPrevented).toBe(false);
  });

  it('a command opening the popover emits no CustomEvent, and consumers can observe state through the native toggle event on the host', () => {
    const el = mountWidget();
    const seenCustomEvents: string[] = [];
    const toggleStates: string[] = [];
    el.addEventListener('toggle', (ev) => toggleStates.push(ev.newState));

    const originalDispatch = el.dispatchEvent.bind(el);
    el.dispatchEvent = (ev: Event) => {
      if (ev instanceof CustomEvent) seenCustomEvents.push(ev.type);
      return originalDispatch(ev);
    };

    el.show();

    expect(seenCustomEvents).toEqual([]);
    expect(toggleStates).toEqual(['open']);
  });
});

describe('siblingsToClose (Task 5, DOM-free)', () => {
  it('returns candidates that are open and not self', () => {
    const a = { open: true };
    const b = { open: false };
    const c = { open: true };

    expect(siblingsToClose([a, b, c], a)).toEqual([c]);
  });

  it('returns an empty array when no candidates are open', () => {
    const a = { open: false };
    const b = { open: false };

    expect(siblingsToClose([a, b], a)).toEqual([]);
  });

  it('excludes self even when self reports open', () => {
    const a = { open: true };
    const b = { open: true };

    expect(siblingsToClose([a, b], a)).toEqual([b]);
  });
});

describe('widget-popover groups (Task 5)', () => {
  it('opening a popover closes an open sibling in the same group', () => {
    const [a, b] = mountWidgets('<widget-popover group="g"></widget-popover><widget-popover group="g"></widget-popover>');

    a.show();
    b.show();

    expect(b.open).toBe(true);
    expect(a.open).toBe(false);
  });

  it('leaves other groups alone', () => {
    const [a, b] = mountWidgets(
      '<widget-popover group="g1"></widget-popover><widget-popover group="g2"></widget-popover>',
    );

    a.show();
    b.show();

    expect(a.open).toBe(true);
    expect(b.open).toBe(true);
  });

  it('leaves ungrouped popovers alone', () => {
    const [a, b] = mountWidgets('<widget-popover group="g"></widget-popover><widget-popover></widget-popover>');

    b.show();
    a.show();

    expect(b.open).toBe(true);
    expect(a.open).toBe(true);
  });

  it('a popover with no group closes nothing', () => {
    const [a, b] = mountWidgets('<widget-popover group="g"></widget-popover><widget-popover></widget-popover>');

    a.show();
    b.show();

    expect(a.open).toBe(true);
    expect(b.open).toBe(true);
  });
});

describe('widget-popover groups — attribute changes and focus (Task 5)', () => {
  it('changing group between opens takes effect immediately', () => {
    const [a, b] = mountWidgets(
      '<widget-popover group="g1"></widget-popover><widget-popover group="g2"></widget-popover>',
    );

    a.show();
    b.show();
    expect(a.open).toBe(true);

    b.setAttribute('group', 'g1');
    b.hide();
    b.show();

    expect(a.open).toBe(false);
  });

  it('closing a sibling this way does not steal focus from the button that triggered the open', () => {
    const [a, b] = mountWidgets('<widget-popover group="g"></widget-popover><widget-popover group="g"></widget-popover>');
    const sourceA = document.createElement('button');
    document.body.append(sourceA);
    a.show(sourceA);
    closeButtonNative(a).focus();

    const triggerB = document.createElement('button');
    document.body.append(triggerB);
    triggerB.focus();
    b.show(triggerB);

    expect(a.open).toBe(false);
    expect(document.activeElement).toBe(triggerB);
  });
});

describe('widget-popover positionAt (Task 6)', () => {
  it('sets both custom properties on the host', () => {
    const el = mountWidget();

    el.positionAt(10, 20);

    expect(el.style.getPropertyValue('--widget-popover-x')).toBe('10px');
    expect(el.style.getPropertyValue('--widget-popover-y')).toBe('20px');
  });

  it('calling it again replaces them', () => {
    const el = mountWidget();

    el.positionAt(10, 20);
    el.positionAt(30, 40);

    expect(el.style.getPropertyValue('--widget-popover-x')).toBe('30px');
    expect(el.style.getPropertyValue('--widget-popover-y')).toBe('40px');
  });
});
