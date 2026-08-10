// AWESOME AI

import { afterEach, describe, expect, it, vi } from 'vitest';
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

function nodeFor(el: NestedListElement, id: string): HTMLLIElement {
  return el.querySelector<HTMLLIElement>(`li[data-id="${id}"]`)!;
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

describe('duplicate ids', () => {
  it('logs a dev error for a duplicate id anywhere in the structure', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount();
    el.setup({
      items: [
        { id: 'dup', label: 'One' },
        { id: 'g', label: 'Group', children: [{ id: 'dup', label: 'Two' }] },
      ],
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('duplicate item id "dup"'));
    spy.mockRestore();
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

describe('no-consumer-children guard', () => {
  it('logs a dev error when the host has non-whitespace children at render time', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<widget-nested-list>  <span>stray</span>  </widget-nested-list>';
    const el = document.body.querySelector('widget-nested-list') as NestedListElement;
    el.setup({ items: leaves });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('does not accept consumer markup'));
    spy.mockRestore();
  });

  it('does not log for whitespace-only children', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<widget-nested-list>\n  \n</widget-nested-list>';
    const el = document.body.querySelector('widget-nested-list') as NestedListElement;
    el.setup({ items: leaves });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('setItems — reuse and update', () => {
  it('an unchanged item keeps the same DOM node reference', () => {
    const el = mount();
    el.setup({ items: nested });
    const before = nodeFor(el, 'g1-a');
    el.setItems(nested);
    expect(nodeFor(el, 'g1-a')).toBe(before);
  });

  it("a changed item's node is reused, not recreated", () => {
    const el = mount();
    el.setup({ items: nested });
    const before = nodeFor(el, 'g1-a');

    const changed: NestedListItem[] = [
      {
        id: 'g1',
        label: 'Group 1',
        children: [
          { id: 'g1-a', label: 'G1 Alpha CHANGED' },
          { id: 'g1-g2', label: 'Group 1.2', children: [{ id: 'g1-g2-a', label: 'G1.2 Alpha' }] },
        ],
      },
      { id: 'b', label: 'Beta' },
    ];
    el.setItems(changed);

    expect(nodeFor(el, 'g1-a')).toBe(before);
    expect(before.querySelector('.widget-nested-list__label')!.textContent).toBe('G1 Alpha CHANGED');
  });
});

describe('setItems — removed and added ids', () => {
  it('a removed id is removed from the DOM and the expansion Set', () => {
    const el = mount();
    el.setup({ items: nested });
    expect(el.expandedIds).toContain('g1-g2');

    el.setItems([{ id: 'g1', label: 'Group 1', children: [{ id: 'g1-a', label: 'G1 Alpha' }] }, { id: 'b', label: 'Beta' }]);

    expect(nodeFor(el, 'g1-g2')).toBeNull();
    expect(el.expandedIds).not.toContain('g1-g2');
  });

  it('an added group id starts collapsed when it is not in an explicit expanded list', () => {
    const el = mount();
    el.setup({ items: nested, expanded: ['g1'] });
    el.setItems([...nested, { id: 'g3', label: 'Group 3', children: [{ id: 'g3-a', label: 'G3 Alpha' }] }]);
    expect(disclosureFor(el, 'g3').getAttribute('aria-expanded')).toBe('false');
  });

  it('an added group id starts expanded when the mode is "all" (the default)', () => {
    const el = mount();
    el.setup({ items: nested });
    el.setItems([...nested, { id: 'g3', label: 'Group 3', children: [] }]);
    expect(disclosureFor(el, 'g3').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('setItems — reordering', () => {
  it('reorders existing nested nodes with insertBefore rather than recreating them', () => {
    const el = mount();
    el.setup({ items: nested });
    const beforeA = nodeFor(el, 'g1-a');
    const beforeG2 = nodeFor(el, 'g1-g2');

    const reordered = [
      {
        id: 'g1',
        label: 'Group 1',
        children: [
          { id: 'g1-g2', label: 'Group 1.2', children: [{ id: 'g1-g2-a', label: 'G1.2 Alpha' }] },
          { id: 'g1-a', label: 'G1 Alpha' },
        ],
      },
      { id: 'b', label: 'Beta' },
    ];
    el.setItems(reordered);

    expect(nodeFor(el, 'g1-a')).toBe(beforeA);
    expect(nodeFor(el, 'g1-g2')).toBe(beforeG2);
    const childIds = Array.from(nodeFor(el, 'g1').querySelector('.widget-nested-list__children')!.children)
      .map((c) => (c as HTMLElement).dataset.id);
    expect(childIds).toEqual(['g1-g2', 'g1-a']);
  });

  it('reorders top-level items too', () => {
    const el = mount();
    el.setup({ items: leaves });
    const beforeA = nodeFor(el, 'a');
    const beforeB = nodeFor(el, 'b');

    el.setItems([leaves[1]!, leaves[0]!]);

    const rootIds = Array.from(el.querySelector('.widget-nested-list__children')!.children)
      .map((c) => (c as HTMLElement).dataset.id);
    expect(rootIds).toEqual(['b', 'a']);
    expect(nodeFor(el, 'a')).toBe(beforeA);
    expect(nodeFor(el, 'b')).toBe(beforeB);
  });
});

describe('setItems — expansion and readiness', () => {
  it('expansion survives setItems for surviving ids', () => {
    const el = mount();
    el.setup({ items: nested, expanded: [] });
    el.expand('g1');

    el.setItems(nested);

    expect(el.expandedIds).toContain('g1');
    expect(disclosureFor(el, 'g1').getAttribute('aria-expanded')).toBe('true');
  });

  it('throws before setup()', () => {
    const el = mount();
    expect(() => el.setItems(leaves)).toThrow(/setup\(\)/);
  });

  it('logs a dev error for duplicate ids passed to setItems', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount();
    el.setup({ items: leaves });

    el.setItems([{ id: 'x', label: 'X' }, { id: 'x', label: 'Y' }]);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('duplicate item id "x"'));
    spy.mockRestore();
  });
});
