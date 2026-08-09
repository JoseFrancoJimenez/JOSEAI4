// AWESOME AI

import { afterEach, describe, expect, it, vi } from 'vitest';
import './ui-card.ts';
import '../ui-button/ui-button.ts';
import type { UiCardElement } from './ui-card.ts';

function mount(html = '<ui-card></ui-card>'): UiCardElement {
  document.body.innerHTML = html;
  return document.body.querySelector('ui-card') as UiCardElement;
}

function outlets(el: UiCardElement): Element[] {
  return Array.from(el.querySelectorAll('[data-outlet]'));
}

function outlet(el: UiCardElement, name: string): Element {
  return el.querySelector(`[data-outlet="${name}"]`)!;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('ui-card skeleton', () => {
  it('renders three empty outlets in header, body, footer order', () => {
    const el = mount();
    expect(outlets(el).map((o) => o.getAttribute('data-outlet'))).toEqual(['header', 'default', 'footer']);
    for (const o of outlets(el)) expect(o.childNodes.length).toBe(0);
  });

  it('renders when instantiated from HTML', () => {
    const el = mount();
    expect(outlets(el).length).toBe(3);
  });

  it('renders when instantiated programmatically', () => {
    const el = document.createElement('ui-card');
    document.body.append(el);
    expect(outlets(el).length).toBe(3);
  });

  it('a move (remove, re-append, flush a microtask) does not re-render', async () => {
    const el = mount();
    const header = outlet(el, 'header');

    el.remove();
    document.body.append(el);
    await Promise.resolve();

    expect(outlet(el, 'header')).toBe(header);
    expect(outlets(el).length).toBe(3);
  });
});

describe('ui-card regions from markup', () => {
  it('data-region content lands in the matching outlet', () => {
    const el = mount('<ui-card><span data-region="header">Title</span></ui-card>');
    expect(outlet(el, 'header').textContent).toBe('Title');
  });

  it('a bare text child lands in the default outlet', () => {
    const el = mount('<ui-card>Area: 1,240 m²</ui-card>');
    expect(outlet(el, 'default').textContent).toBe('Area: 1,240 m²');
  });

  it('whitespace-only text nodes are ignored', () => {
    const el = mount('<ui-card>\n  <span data-region="header">Title</span>\n</ui-card>');
    expect(outlet(el, 'default').childNodes.length).toBe(0);
  });

  it('two children with the same data-region both land, in document order', () => {
    const el = mount(
      '<ui-card><ui-button data-region="footer" label="Cancel"></ui-button><ui-button data-region="footer" label="Save"></ui-button></ui-card>',
    );
    const labels = Array.from(outlet(el, 'footer').querySelectorAll('ui-button')).map((b) => b.getAttribute('label'));
    expect(labels).toEqual(['Cancel', 'Save']);
  });

  it('an undeclared data-region name produces a dev error and the content is destroyed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount('<ui-card><span data-region="lable">Title</span></ui-card>');

    expect(error).toHaveBeenCalledTimes(1);
    for (const o of outlets(el)) expect(o.childNodes.length).toBe(0);

    error.mockRestore();
  });

  it('a region nobody supplied leaves its outlet empty', () => {
    const el = mount('<ui-card><span data-region="header">Title</span></ui-card>');
    expect(outlet(el, 'default').childNodes.length).toBe(0);
    expect(outlet(el, 'footer').childNodes.length).toBe(0);
  });

  it('a move does not re-harvest: the rendered skeleton is intact', async () => {
    const el = mount('<ui-card><span data-region="header">Title</span></ui-card>');
    el.remove();
    document.body.append(el);
    await Promise.resolve();

    expect(outlet(el, 'header').textContent).toBe('Title');
    expect(outlets(el).length).toBe(3);
  });
});

describe('ui-card setContent', () => {
  it('works after render, immediately, and never throws', () => {
    const el = mount();
    el.setContent('header', 'Title');
    expect(outlet(el, 'header').textContent).toBe('Title');
  });

  it('works before render, stashed, and applies at render', () => {
    const el = document.createElement('ui-card');
    el.setContent('header', 'Title');
    document.body.append(el);
    expect(outlet(el, 'header').textContent).toBe('Title');
  });

  it('overrides harvested content', () => {
    const el = mount('<ui-card><span data-region="header">Old</span></ui-card>');
    el.setContent('header', 'New');
    expect(outlet(el, 'header').textContent).toBe('New');
  });

  it('called before the host is attached beats the later harvest', () => {
    const el = document.createElement('ui-card');
    const span = document.createElement('span');
    span.dataset.region = 'header';
    span.textContent = 'Old';
    el.append(span);
    el.setContent('header', 'New');
    document.body.append(el);

    expect(outlet(el, 'header').textContent).toBe('New');
  });

  it('setContent(name, "") clears a filled outlet', () => {
    const el = mount('<ui-card><span data-region="header">Title</span></ui-card>');
    el.setContent('header', '');
    expect(outlet(el, 'header').textContent).toBe('');
  });

  it('an unknown region name is ignored without throwing', () => {
    const el = mount();
    expect(() => el.setContent('bogus' as never, 'x')).not.toThrow();
  });

  it('a string is inserted as text, never parsed as HTML', () => {
    const el = mount();
    el.setContent('header', '<b>x</b>');
    expect(outlet(el, 'header').querySelector('b')).toBeNull();
    expect(outlet(el, 'header').textContent).toBe('<b>x</b>');
  });

  it("a fragment's children all move", () => {
    const el = mount();
    const fragment = document.createDocumentFragment();
    fragment.append(document.createElement('i'), document.createElement('b'));
    el.setContent('header', fragment);
    expect(outlet(el, 'header').children.length).toBe(2);
  });
});

describe('ui-card region content survives teardown', () => {
  it('a ui-button supplied in a region is connected and functional after render', () => {
    const el = mount('<ui-card><ui-button data-region="footer" label="Open"></ui-button></ui-card>');
    const button = outlet(el, 'footer').querySelector('ui-button')!;

    expect(button.isConnected).toBe(true);

    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    button.querySelector('.ui-button__control')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
