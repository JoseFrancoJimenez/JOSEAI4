// AWESOME AI

import { afterEach, describe, expect, it, vi } from 'vitest';
import './widget-floating-panel.ts';
import { WidgetFloatingPanelElement, siblingsToClose } from './widget-floating-panel.ts';
import type { WidgetFloatingPanelRegion } from './widget-floating-panel.ts';

function mountWidget(html = '<widget-floating-panel></widget-floating-panel>'): WidgetFloatingPanelElement {
  document.body.innerHTML = html;
  return document.body.querySelector('widget-floating-panel') as WidgetFloatingPanelElement;
}

function header(el: WidgetFloatingPanelElement): Element {
  return el.querySelector('[data-outlet="header"]')!;
}

function body(el: WidgetFloatingPanelElement): Element {
  return el.querySelector('[data-outlet="default"]')!;
}

function closeButtonNative(el: WidgetFloatingPanelElement): HTMLButtonElement {
  return header(el).querySelector('.widget-floating-panel__close')!.querySelector('button')!;
}

function mountWidgets(html: string): [WidgetFloatingPanelElement, WidgetFloatingPanelElement] {
  document.body.innerHTML = html;
  const els = Array.from(document.body.querySelectorAll('widget-floating-panel'));
  return [els[0]!, els[1]!];
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('widget-floating-panel skeleton (Task 2)', () => {
  it('renders when instantiated from HTML', () => {
    const el = mountWidget();
    expect(el.querySelectorAll('ui-card').length).toBe(1);
  });

  it('renders when instantiated programmatically', () => {
    const el = document.createElement('widget-floating-panel');
    document.body.append(el);
    expect(el.querySelectorAll('ui-card').length).toBe(1);
  });

  it('the close button is inside the card header and has an accessible name', () => {
    const el = mountWidget();
    const closeButton = header(el).querySelector('.widget-floating-panel__close')!;
    expect(closeButton).not.toBeNull();
    expect(closeButton.tagName.toLowerCase()).toBe('ui-button');
    expect(closeButton.getAttribute('aria-label')).toBe('Close');
  });

  it('close-label overrides the close button default accessible name', () => {
    const el = mountWidget('<widget-floating-panel close-label="Dismiss"></widget-floating-panel>');
    const closeButton = header(el).querySelector('.widget-floating-panel__close')!;
    expect(closeButton.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('the live wrapper exists in the body outlet with aria-live="polite"', () => {
    const el = mountWidget();
    const live = body(el).querySelector('.widget-floating-panel__live')!;
    expect(live).not.toBeNull();
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('a move (remove, re-append, flush a microtask) does not re-render or re-harvest', async () => {
    const el = mountWidget();
    const card = el.querySelector('ui-card');
    const closeButton = header(el).querySelector('.widget-floating-panel__close');

    el.remove();
    document.body.append(el);
    await Promise.resolve();

    expect(el.querySelector('ui-card')).toBe(card);
    expect(header(el).querySelector('.widget-floating-panel__close')).toBe(closeButton);
    expect(el.querySelectorAll('ui-card').length).toBe(1);
  });
});

describe('widget-floating-panel region forwarding (Task 3)', () => {
  it('data-region="header" content lands in the header, with the close button still present', () => {
    const el = mountWidget('<widget-floating-panel><span data-region="header">Layers</span></widget-floating-panel>');
    expect(header(el).textContent).toContain('Layers');
    expect(header(el).querySelector('.widget-floating-panel__close')).not.toBeNull();
  });

  it('data-region="footer" content is forwarded to the card footer', () => {
    const el = mountWidget('<widget-floating-panel><span data-region="footer">Actions</span></widget-floating-panel>');
    const footer = el.querySelector('[data-outlet="footer"]')!;
    expect(footer.textContent).toContain('Actions');
  });

  it('bare text content lands in the live wrapper, inside the body outlet', () => {
    const el = mountWidget('<widget-floating-panel>Nothing selected</widget-floating-panel>');
    const live = body(el).querySelector('.widget-floating-panel__live')!;
    expect(live.textContent).toBe('Nothing selected');
  });
});

describe('widget-floating-panel setContent (Task 3)', () => {
  it('setContent("header", ...) after render replaces the content and preserves the close button', () => {
    const el = mountWidget();

    el.setContent('header', 'Title');
    expect(header(el).textContent).toContain('Title');
    expect(header(el).querySelector('.widget-floating-panel__close')).not.toBeNull();

    el.setContent('header', 'Other');
    expect(header(el).textContent).toContain('Other');
    expect(header(el).textContent).not.toContain('Title');
    expect(header(el).querySelector('.widget-floating-panel__close')).not.toBeNull();
  });

  it('setContent("default", ...) writes inside the live wrapper; the wrapper is the same node before and after', () => {
    const el = mountWidget();
    const live = body(el).querySelector('.widget-floating-panel__live')!;

    el.setContent('default', 'Feature info');

    expect(body(el).querySelector('.widget-floating-panel__live')).toBe(live);
    expect(live.textContent).toBe('Feature info');
  });

  it('setContent("default", "") clears the wrapper without removing it', () => {
    const el = mountWidget();
    const live = body(el).querySelector('.widget-floating-panel__live')!;
    el.setContent('default', 'Feature info');

    el.setContent('default', '');

    expect(body(el).querySelector('.widget-floating-panel__live')).toBe(live);
    expect(live.textContent).toBe('');
  });

  it('setContent("default", ...) never parses a string as HTML', () => {
    const el = mountWidget();
    el.setContent('default', '<b>x</b>');
    const live = body(el).querySelector('.widget-floating-panel__live')!;
    expect(live.querySelector('b')).toBeNull();
    expect(live.textContent).toBe('<b>x</b>');
  });
});

describe('widget-floating-panel close button and region errors (Task 3)', () => {
  it('a ui-button supplied in the header region is connected and functional after render', () => {
    const el = mountWidget(
      '<widget-floating-panel><ui-button data-region="header" label="Pin"></ui-button></widget-floating-panel>',
    );
    const suppliedButton = header(el).querySelector('ui-button:not(.widget-floating-panel__close)')!;
    expect(suppliedButton.isConnected).toBe(true);

    let clicked = false;
    suppliedButton.addEventListener('click', () => {
      clicked = true;
    });
    suppliedButton.querySelector('button')!.click();
    expect(clicked).toBe(true);
  });

  it('clicking the close button hides the panel', () => {
    const el = mountWidget();
    el.show();
    expect(el.open).toBe(true);

    closeButtonNative(el).click();

    expect(el.open).toBe(false);
  });

  it('an unknown region name passed to setContent is ignored without throwing', () => {
    const el = mountWidget();
    expect(() => el.setContent('bogus' as WidgetFloatingPanelRegion, 'x')).not.toThrow();
  });

  it('an unknown harvested region name produces the helper\'s dev error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mountWidget('<widget-floating-panel><span data-region="typo">x</span></widget-floating-panel>');

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('widget-floating-panel open state (§4)', () => {
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

  it('the open property reflects to the attribute, both ways', () => {
    const el = mountWidget();

    el.open = true;
    expect(el.hasAttribute('open')).toBe(true);

    el.open = false;
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('setting the open attribute directly opens and closes the panel', () => {
    const el = mountWidget();

    el.setAttribute('open', '');
    expect(el.open).toBe(true);

    el.removeAttribute('open');
    expect(el.open).toBe(false);
  });

  it('<widget-floating-panel open> in markup renders open', () => {
    const el = mountWidget('<widget-floating-panel open></widget-floating-panel>');
    expect(el.open).toBe(true);
  });
});

// "A closed panel's content is not focusable" is not asserted here: jsdom performs no layout
// (docs/testing.md §3), does not apply the widget's imported CSS in this test environment, and
// its focus() ignores display entirely regardless — a pre-existing jsdom limitation, not
// specific to this widget or its former stub. Stays a manual/sandbox check.

describe('widget-floating-panel focus restoration (Task 4)', () => {
  it('show() moves focus to the first focusable element', () => {
    const el = mountWidget();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    el.show();

    expect(document.activeElement).toBe(closeButtonNative(el));
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

  it('with no source, closing does not throw and blurs the previously focused element', () => {
    const el = mountWidget();
    el.show();
    closeButtonNative(el).focus();

    expect(() => el.hide()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('with a source no longer connected, closing does not throw and blurs the previously focused element', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    source.remove();
    closeButtonNative(el).focus();

    expect(() => el.hide()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('widget-floating-panel Escape (Task 4)', () => {
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
});

describe('widget-floating-panel focus target on open (§8)', () => {
  it('show() moves focus to header content before the close button, when header content is focusable', () => {
    const el = mountWidget('<widget-floating-panel><button data-region="header">Pin</button></widget-floating-panel>');

    el.show();

    expect(document.activeElement).toBe(header(el).querySelector('button[data-region="header"]'));
  });
});

describe('widget-floating-panel Tab trap (§8)', () => {
  it('Tab from the last focusable element returns focus to source', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    closeButtonNative(el).dispatchEvent(tab);

    expect(document.activeElement).toBe(source);
    expect(tab.defaultPrevented).toBe(true);
  });

  it('Shift+Tab from the first focusable element returns focus to source', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    closeButtonNative(el).dispatchEvent(tab);

    expect(document.activeElement).toBe(source);
    expect(tab.defaultPrevented).toBe(true);
  });

  it('Tab from a focusable element that is not the last is left alone', () => {
    const el = mountWidget('<widget-floating-panel><button data-region="header">Pin</button></widget-floating-panel>');
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    const headerButton = header(el).querySelector('button[data-region="header"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(headerButton);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    headerButton.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
  });

  it('with no source, Tab from the last focusable element is left alone', () => {
    const el = mountWidget();
    el.show();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

    closeButtonNative(el).dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
  });

  it('with a source no longer connected, Tab is left alone', () => {
    const el = mountWidget();
    const source = document.createElement('button');
    document.body.append(source);

    el.show(source);
    source.remove();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    closeButtonNative(el).dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
  });
});

describe('widget-floating-panel:toggle event (§5)', () => {
  it('clicking the close button emits widget-floating-panel:toggle once with detail: { open: false }', () => {
    const el = mountWidget();
    el.show();
    const events: Array<{ open: boolean }> = [];
    el.addEventListener('widget-floating-panel:toggle', (ev) => events.push((ev as CustomEvent<{ open: boolean }>).detail));

    closeButtonNative(el).click();

    expect(events).toEqual([{ open: false }]);
  });

  it('Escape emits widget-floating-panel:toggle once with detail: { open: false }', () => {
    const el = mountWidget();
    el.show();
    const events: Array<{ open: boolean }> = [];
    el.addEventListener('widget-floating-panel:toggle', (ev) => events.push((ev as CustomEvent<{ open: boolean }>).detail));

    closeButtonNative(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(events).toEqual([{ open: false }]);
  });

  it('show(), hide(), and toggle() do not emit widget-floating-panel:toggle', () => {
    const el = mountWidget();
    const events: string[] = [];
    el.addEventListener('widget-floating-panel:toggle', () => events.push('toggle'));

    el.show();
    el.hide();
    el.toggle();
    el.toggle();

    expect(events).toEqual([]);
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

describe('widget-floating-panel groups (Task 5)', () => {
  it('opening a popover closes an open sibling in the same group', () => {
    const [a, b] = mountWidgets('<widget-floating-panel group="g"></widget-floating-panel><widget-floating-panel group="g"></widget-floating-panel>');

    a.show();
    b.show();

    expect(b.open).toBe(true);
    expect(a.open).toBe(false);
  });

  it('leaves other groups alone', () => {
    const [a, b] = mountWidgets(
      '<widget-floating-panel group="g1"></widget-floating-panel><widget-floating-panel group="g2"></widget-floating-panel>',
    );

    a.show();
    b.show();

    expect(a.open).toBe(true);
    expect(b.open).toBe(true);
  });

  it('leaves ungrouped popovers alone', () => {
    const [a, b] = mountWidgets('<widget-floating-panel group="g"></widget-floating-panel><widget-floating-panel></widget-floating-panel>');

    b.show();
    a.show();

    expect(b.open).toBe(true);
    expect(a.open).toBe(true);
  });

  it('a popover with no group closes nothing', () => {
    const [a, b] = mountWidgets('<widget-floating-panel group="g"></widget-floating-panel><widget-floating-panel></widget-floating-panel>');

    a.show();
    b.show();

    expect(a.open).toBe(true);
    expect(b.open).toBe(true);
  });
});

describe('widget-floating-panel groups — attribute changes and focus (Task 5)', () => {
  it('changing group between opens takes effect immediately', () => {
    const [a, b] = mountWidgets(
      '<widget-floating-panel group="g1"></widget-floating-panel><widget-floating-panel group="g2"></widget-floating-panel>',
    );

    a.show();
    b.show();
    expect(a.open).toBe(true);

    b.setAttribute('group', 'g1');
    b.hide();
    b.show();

    expect(a.open).toBe(false);
  });

  it('closing a sibling this way does not steal focus back to its own source', () => {
    const [a, b] = mountWidgets('<widget-floating-panel group="g"></widget-floating-panel><widget-floating-panel group="g"></widget-floating-panel>');
    const sourceA = document.createElement('button');
    document.body.append(sourceA);
    a.show(sourceA);
    closeButtonNative(a).focus();

    const triggerB = document.createElement('button');
    document.body.append(triggerB);
    triggerB.focus();
    b.show(triggerB);

    expect(a.open).toBe(false);
    expect(document.activeElement).not.toBe(sourceA);
    expect(document.activeElement).toBe(closeButtonNative(b));
  });
});

describe('widget-floating-panel positionAt (Task 6)', () => {
  it('sets both custom properties on the host', () => {
    const el = mountWidget();

    el.positionAt(10, 20);

    expect(el.style.getPropertyValue('--widget-floating-panel-x')).toBe('10px');
    expect(el.style.getPropertyValue('--widget-floating-panel-y')).toBe('20px');
  });

  it('calling it again replaces them', () => {
    const el = mountWidget();

    el.positionAt(10, 20);
    el.positionAt(30, 40);

    expect(el.style.getPropertyValue('--widget-floating-panel-x')).toBe('30px');
    expect(el.style.getPropertyValue('--widget-floating-panel-y')).toBe('40px');
  });
});

describe('widget-floating-panel positioning dev guard (§6)', () => {
  it('warns on first open when there is no positioned ancestor', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mountWidget();

    el.show();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('widget-floating-panel');
    errorSpy.mockRestore();
  });

  it('does not warn when a positioned ancestor exists', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<div style="position: relative;"><widget-floating-panel></widget-floating-panel></div>';
    const el = document.body.querySelector('widget-floating-panel') as WidgetFloatingPanelElement;

    el.show();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('only warns once per instance, even across multiple opens', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mountWidget();

    el.show();
    el.hide();
    el.show();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
