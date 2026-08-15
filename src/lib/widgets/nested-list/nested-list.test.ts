// AWESOME AI

import { afterEach, describe, expect, it } from 'vitest';
import './nested-list.ts';
import { NestedListElement } from './nested-list.ts';
import type { NestedListItem, NestedListToggleDetail } from './nested-list.ts';

function mount(): NestedListElement {
  const el = document.createElement('widget-nested-list');
  document.body.append(el);
  return el;
}

function disclosureFor(el: NestedListElement, id: string): HTMLButtonElement {
  return el.querySelector<HTMLButtonElement>(`.widget-nested-list__disclosure[data-id="${id}"]`)!;
}

const leaves: NestedListItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
];

const nested: NestedListItem[] = [
  {
    id: 'g1',
    label: 'Group 1',
    children: [
      { id: 'g1-a', label: 'G1 Alpha' },
      {
        id: 'g1-g2',
        label: 'Group 1.2',
        children: [{ id: 'g1-g2-a', label: 'G1.2 Alpha' }],
      },
    ],
  },
  { id: 'b', label: 'Beta' },
];

afterEach(() => { document.body.replaceChildren(); });

describe('readiness', () => {
  it('renders nothing before setup()', () => {
    const el = mount();
    expect(el.innerHTML).toBe('');
  });

  it('renders the flat list after setup()', () => {
    const el = mount();
    el.setup({ items: leaves });
    const items = el.querySelectorAll(`.${'widget-nested-list__leaf'}`);
    expect(items).toHaveLength(2);
  });

  it('setup() twice is a no-op', () => {
    const el = mount();
    el.setup({ items: leaves });
    el.setup({ items: [{ id: 'c', label: 'Gamma' }] });
    const labels = Array.from(el.querySelectorAll('.widget-nested-list__label')).map((n) => n.textContent);
    expect(labels).toEqual(['Alpha', 'Beta']);
  });
});

describe('instantiation', () => {
  it('works from HTML, setup() applied afterwards', () => {
    document.body.innerHTML = '<widget-nested-list></widget-nested-list>';
    const el = document.body.querySelector('widget-nested-list') as NestedListElement;
    el.setup({ items: leaves });
    expect(el.querySelectorAll('.widget-nested-list__leaf')).toHaveLength(2);
  });

  it('works instantiated programmatically', () => {
    const el = mount();
    el.setup({ items: leaves });
    expect(el.querySelectorAll('.widget-nested-list__leaf')).toHaveLength(2);
  });
});

describe('rendering', () => {
  it('renders each leaf label as text content', () => {
    const el = mount();
    el.setup({ items: leaves });
    const labels = Array.from(el.querySelectorAll('.widget-nested-list__label')).map((n) => n.textContent);
    expect(labels).toEqual(['Alpha', 'Beta']);
  });

  it('renders an empty children list for an empty items array', () => {
    const el = mount();
    el.setup({ items: [] });
    expect(el.querySelector('.widget-nested-list__children')).not.toBeNull();
    expect(el.querySelectorAll('.widget-nested-list__leaf')).toHaveLength(0);
  });
});

describe('move', () => {
  it('a disconnect + reconnect preserves the rendered content', async () => {
    const el = mount();
    el.setup({ items: leaves });
    el.remove();
    document.body.append(el);
    await Promise.resolve();
    expect(el.querySelectorAll('.widget-nested-list__leaf')).toHaveLength(2);
  });

  it('a disconnect + reconnect does not double-subscribe the click listener', async () => {
    const el = mount();
    el.setup({ items: nested, expanded: [] });
    el.remove();
    document.body.append(el);
    await Promise.resolve();

    const events: Event[] = [];
    el.addEventListener('widget-nested-list:toggle', (e) => events.push(e));
    disclosureFor(el, 'g1').click();

    expect(events).toHaveLength(1);
  });
});

describe('groups', () => {
  it('renders three levels of nesting, each toggling independently', () => {
    const el = mount();
    el.setup({ items: nested, expanded: 'all' });
    expect(el.querySelectorAll('.widget-nested-list__group')).toHaveLength(2);
    expect(el.querySelectorAll('.widget-nested-list__leaf')).toHaveLength(3);

    disclosureFor(el, 'g1-g2').click();
    expect(disclosureFor(el, 'g1-g2').getAttribute('aria-expanded')).toBe('false');
    expect(disclosureFor(el, 'g1').getAttribute('aria-expanded')).toBe('true');
  });

  it('aria-controls matches the children <ul> id, and ids stay unique across two instances', () => {
    const a = mount();
    const b = mount();
    a.setup({ items: nested });
    b.setup({ items: nested });

    for (const el of [a, b]) {
      const button = disclosureFor(el, 'g1');
      const childrenId = button.getAttribute('aria-controls')!;
      expect(document.getElementById(childrenId)).toBe(button.closest('li')!.querySelector('ul'));
    }
    const idA = disclosureFor(a, 'g1').getAttribute('aria-controls');
    const idB = disclosureFor(b, 'g1').getAttribute('aria-controls');
    expect(idA).not.toBe(idB);
  });

  it('a collapsed group starts with aria-expanded="false" and its children <ul> hidden', () => {
    const el = mount();
    el.setup({ items: nested, expanded: [] });
    const button = disclosureFor(el, 'g1');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const childrenEl = document.getElementById(button.getAttribute('aria-controls')!) as HTMLUListElement;
    expect(childrenEl.hidden).toBe(true);
  });
});

describe('toggle', () => {
  it('a click on the disclosure emits widget-nested-list:toggle once, with { id, expanded }', () => {
    const el = mount();
    el.setup({ items: nested, expanded: [] });
    const events: CustomEvent<NestedListToggleDetail>[] = [];
    el.addEventListener('widget-nested-list:toggle', (e) => events.push(e as CustomEvent<NestedListToggleDetail>));

    disclosureFor(el, 'g1').click();

    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toEqual({ id: 'g1', expanded: true });
    expect(disclosureFor(el, 'g1').getAttribute('aria-expanded')).toBe('true');
    const childrenEl = document.getElementById(disclosureFor(el, 'g1').getAttribute('aria-controls')!) as HTMLUListElement;
    expect(childrenEl.hidden).toBe(false);
  });

  it('a second click collapses again and emits { expanded: false }', () => {
    const el = mount();
    el.setup({ items: nested, expanded: [] });
    const events: CustomEvent<NestedListToggleDetail>[] = [];
    el.addEventListener('widget-nested-list:toggle', (e) => events.push(e as CustomEvent<NestedListToggleDetail>));

    disclosureFor(el, 'g1').click();
    disclosureFor(el, 'g1').click();

    expect(events).toHaveLength(2);
    expect(events[1]!.detail).toEqual({ id: 'g1', expanded: false });
  });

  it('a click elsewhere in the widget does not emit', () => {
    const el = mount();
    el.setup({ items: nested });
    const events: Event[] = [];
    el.addEventListener('widget-nested-list:toggle', (e) => events.push(e));

    el.querySelector('.widget-nested-list__leaf')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(events).toHaveLength(0);
  });
});

describe('commands', () => {
  it('expand()/collapse() reflect state but do not emit', () => {
    const el = mount();
    el.setup({ items: nested, expanded: [] });
    const events: Event[] = [];
    el.addEventListener('widget-nested-list:toggle', (e) => events.push(e));

    el.expand('g1');
    expect(disclosureFor(el, 'g1').getAttribute('aria-expanded')).toBe('true');
    el.collapse('g1');
    expect(disclosureFor(el, 'g1').getAttribute('aria-expanded')).toBe('false');

    expect(events).toHaveLength(0);
  });

  it('commands throw before setup()', () => {
    const el = mount();
    expect(() => el.expand('g1')).toThrow(/setup\(\)/);
    expect(() => el.collapse('g1')).toThrow(/setup\(\)/);
  });
});

describe('expandedIds', () => {
  it('is empty before setup()', () => {
    const el = mount();
    expect(el.expandedIds).toEqual([]);
  });

  it('defaults to every group expanded ("all")', () => {
    const el = mount();
    el.setup({ items: nested });
    expect(new Set(el.expandedIds)).toEqual(new Set(['g1', 'g1-g2']));
  });

  it('seeds only the given ids when expanded is an explicit array', () => {
    const el = mount();
    el.setup({ items: nested, expanded: ['g1'] });
    expect(el.expandedIds).toEqual(['g1']);
  });
});

describe('extras callbacks', () => {
  it('inserts a callback Node as-is into the extras outlet', () => {
    const el = mount();
    const nodes = new Map<string, HTMLSpanElement>();
    el.setup({
      items: leaves,
      renderLeaf: (item) => {
        const node = document.createElement('span');
        node.textContent = 'extra';
        nodes.set(item.id, node);
        return node;
      },
    });
    const outlet = el.querySelector('.widget-nested-list__leaf .widget-nested-list__extras')!;
    expect(outlet.firstChild).toBe(nodes.get('a'));
  });

  it('inserts a callback string as text content', () => {
    const el = mount();
    el.setup({ items: leaves, renderLeaf: (item) => `note:${item.id}` });
    const outlet = el.querySelector('.widget-nested-list__leaf .widget-nested-list__extras')!;
    expect(outlet.textContent).toBe('note:a');
  });

  it('leaves the outlet empty when the callback returns null', () => {
    const el = mount();
    el.setup({ items: leaves, renderLeaf: () => null });
    const outlet = el.querySelector('.widget-nested-list__leaf .widget-nested-list__extras')!;
    expect(outlet.childNodes).toHaveLength(0);
  });

  it('leaves the outlet empty when no callback is supplied', () => {
    const el = mount();
    el.setup({ items: leaves });
    const outlet = el.querySelector('.widget-nested-list__leaf .widget-nested-list__extras')!;
    expect(outlet.childNodes).toHaveLength(0);
  });
});

describe('extras callbacks — groups', () => {
  it('fills a group\'s extras outlet from renderGroup, as a sibling of the disclosure button', () => {
    const el = mount();
    el.setup({ items: nested, renderGroup: (group) => `count:${group.children.length}` });
    const header = disclosureFor(el, 'g1').parentElement!;
    expect(header.querySelector('.widget-nested-list__extras')!.textContent).toBe('count:2');
    expect(disclosureFor(el, 'g1').querySelector('.widget-nested-list__extras')).toBeNull();
  });

  it('a click on an extras control does not toggle the group and is not re-dispatched', () => {
    const el = mount();
    const control = document.createElement('button');
    control.textContent = 'action';
    let controlClicks = 0;
    control.addEventListener('click', () => { controlClicks++; });
    el.setup({ items: nested, expanded: [], renderGroup: () => control });

    const events: Event[] = [];
    el.addEventListener('widget-nested-list:toggle', (e) => events.push(e));
    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(controlClicks).toBe(1);
    expect(events).toHaveLength(0);
    expect(disclosureFor(el, 'g1').getAttribute('aria-expanded')).toBe('false');
  });
});

