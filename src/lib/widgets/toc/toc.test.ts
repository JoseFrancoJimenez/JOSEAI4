import { describe, it, expect, afterEach } from 'vitest';
import { TocComponent } from './toc.ts';
import type { ITocChangeDetail } from './toc.ts';
import { TocModel } from './toc-model.ts';
import type { ITocNodeDef, ITocNode } from './toc.types.ts';

/**
 * A (branch)
 *  ├─ A1 (branch)
 *  │   ├─ A1a (leaf)
 *  │   └─ A1b (leaf)
 *  └─ A2 (leaf)
 * B (leaf, root)
 */
function sampleDefs(): ITocNodeDef[] {
  return [
    { id: 'A', parent_id: null, type: 't' },
    { id: 'A1', parent_id: 'A', type: 't' },
    { id: 'A1a', parent_id: 'A1', type: 't' },
    { id: 'A1b', parent_id: 'A1', type: 't' },
    { id: 'A2', parent_id: 'A', type: 't' },
    { id: 'B', parent_id: null, type: 't' },
  ];
}

function mount(model: TocModel, renderNode?: (node: ITocNode) => HTMLElement): TocComponent {
  const host = document.createElement(TocComponent.tagName) as TocComponent;
  document.body.appendChild(host);
  host.setup(model, renderNode);
  return host;
}

function renderedIds(host: TocComponent): Set<string> {
  return new Set([...host.querySelectorAll<HTMLElement>('toc-node')].map((el) => el.dataset.nodeId!));
}

/** Pure reference builder: which node ids *should* be visible, given the model + expanded set. */
function expectedVisible(model: TocModel, expanded: Set<string>): Set<string> {
  const ids = new Set<string>();
  const walk = (node: ITocNode): void => {
    ids.add(node.id);
    if (expanded.has(node.id)) for (const child of node.children) walk(child);
  };
  for (const root of model.roots) walk(root);
  return ids;
}

/** The DOM-vs-model parity oracle: rendered ids AND each node's expanded/leaf reflection must match the model. */
function assertParity(host: TocComponent, model: TocModel, expanded: Set<string>): void {
  expect(renderedIds(host)).toEqual(expectedVisible(model, expanded));
  for (const el of host.querySelectorAll<HTMLElement>('toc-node')) {
    const id = el.dataset.nodeId!;
    const hasChildren = model.get(id)!.children.length > 0;
    const toggle = el.querySelector<HTMLElement>('.toc-toggle')!;
    expect(toggle.classList.contains('toc-toggle--leaf')).toBe(!hasChildren);
    if (hasChildren) expect(el.classList.contains('is-expanded')).toBe(expanded.has(id));
  }
}

/** Mounts `model` and mirrors `change`'s snapshot into a Set, for use with {@link assertParity}. */
function mountTracked(model: TocModel): { host: TocComponent; getExpanded: () => Set<string> } {
  const host = mount(model);
  let expanded = new Set<string>();
  host.addEventListener(TocComponent.events.change, (ev) => {
    expanded = new Set((ev as CustomEvent<ITocChangeDetail>).detail.expanded);
  });
  return { host, getExpanded: () => expanded };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('TocComponent — DOM/model parity (all-surgical)', () => {
  it('keeps the DOM in sync with the model after every operation, and combinations of them', () => {
    const model = new TocModel(sampleDefs());
    const { host, getExpanded } = mountTracked(model);

    assertParity(host, model, getExpanded());

    host.expand('A');
    assertParity(host, model, getExpanded());

    host.expand('A1');
    assertParity(host, model, getExpanded());

    host.collapse('A1');
    assertParity(host, model, getExpanded());

    model.add({ id: 'A1c', parent_id: 'A1', type: 't' });
    assertParity(host, model, getExpanded());

    host.expand('A1');
    assertParity(host, model, getExpanded());

    model.move('A2', 'A1');
    assertParity(host, model, getExpanded());

    model.remove('A1a');
    assertParity(host, model, getExpanded());

    host.expandAll();
    assertParity(host, model, getExpanded());

    host.collapseAll();
    assertParity(host, model, getExpanded());

    model.clear();
    assertParity(host, model, getExpanded());
  });
});

describe('TocComponent — lazy build', () => {
  it('builds a node’s children only when it expands, and removes them on collapse', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);

    expect(host.querySelector('toc-node[data-node-id="A1"]')).toBeNull();

    host.expand('A');
    expect(host.querySelector('toc-node[data-node-id="A1"]')).toBeTruthy();
    expect(host.querySelector('toc-node[data-node-id="A1a"]')).toBeNull(); // A1 itself still collapsed

    host.expand('A1');
    expect(host.querySelector('toc-node[data-node-id="A1a"]')).toBeTruthy();

    host.collapse('A1');
    expect(host.querySelector('toc-node[data-node-id="A1a"]')).toBeNull();
    expect(host.querySelector('toc-node[data-node-id="A1"]')).toBeTruthy(); // A1's own row stays

    host.collapse('A');
    expect(host.querySelector('toc-node[data-node-id="A1"]')).toBeNull();
  });

  it('does not leak stale index entries across collapse/expand cycles or id reuse', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.expand('A');
    host.expand('A1');
    host.collapse('A');
    host.expand('A');
    host.expand('A1');
    expect(host.querySelectorAll('toc-node[data-node-id="A1a"]').length).toBe(1);

    model.remove('A1a');
    model.add({ id: 'A1a', parent_id: 'A1', type: 't' }); // reused id
    expect(host.querySelectorAll('toc-node[data-node-id="A1a"]').length).toBe(1);
  });
});

describe('TocComponent — expansion survives node destruction', () => {
  it('re-expanding a collapsed ancestor restores a deep descendant’s expansion, without asking again', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);

    host.expand('A');
    host.expand('A1');
    expect(host.querySelector('toc-node[data-node-id="A1a"]')).toBeTruthy();

    host.collapse('A'); // destroys A1 and A1a's <toc-node>s; #expanded still remembers A1
    expect(host.querySelector('toc-node[data-node-id="A1"]')).toBeNull();

    host.expand('A');
    expect(host.querySelector('toc-node[data-node-id="A1"]')).toBeTruthy();
    expect(host.querySelector('toc-node[data-node-id="A1a"]')).toBeTruthy();
  });
});

describe('TocComponent — toggle ownership', () => {
  it('a click on a node’s toggle is handled by the widget: it updates state and tells the node to reflect it', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    const events: string[] = [];
    host.addEventListener(TocComponent.events.clickToggle, () => events.push('clickToggle'));
    host.addEventListener(TocComponent.events.change, () => events.push('change'));

    const toggle = host.querySelector<HTMLElement>('toc-node[data-node-id="A"] .toc-toggle')!;
    toggle.click();

    expect(events).toEqual(['clickToggle', 'change']);
    expect(host.querySelector('toc-node[data-node-id="A"]')!.classList.contains('is-expanded')).toBe(true);
    expect(host.querySelector('toc-node[data-node-id="A1"]')).toBeTruthy();
  });
});

describe('TocComponent — leaf/branch transitions', () => {
  it('add: a leaf’s first child reveals its toggle, but the node starts collapsed', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    const bToggle = (): HTMLElement => host.querySelector<HTMLElement>('toc-node[data-node-id="B"] .toc-toggle')!;
    expect(bToggle().classList.contains('toc-toggle--leaf')).toBe(true);

    model.add({ id: 'B1', parent_id: 'B', type: 't' });

    expect(bToggle().classList.contains('toc-toggle--leaf')).toBe(false);
    expect(bToggle().getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('toc-node[data-node-id="B1"]')).toBeNull();
  });

  it('remove: losing the last child turns a branch back into a leaf', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.expand('A');
    host.expand('A1');

    model.remove('A1a');
    model.remove('A1b');

    const a1Toggle = host.querySelector<HTMLElement>('toc-node[data-node-id="A1"] .toc-toggle')!;
    expect(a1Toggle.classList.contains('toc-toggle--leaf')).toBe(true);
  });

  it('move: the old parent may become a leaf, the new parent may become a branch', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.expand('A');

    model.move('A2', 'B'); // B gains its first child -> becomes a branch
    model.move('A1', 'B'); // A loses its last remaining child -> becomes a leaf

    const bToggle = host.querySelector<HTMLElement>('toc-node[data-node-id="B"] .toc-toggle')!;
    expect(bToggle.classList.contains('toc-toggle--leaf')).toBe(false);
    const aToggle = host.querySelector<HTMLElement>('toc-node[data-node-id="A"] .toc-toggle')!;
    expect(aToggle.classList.contains('toc-toggle--leaf')).toBe(true);
  });
});

describe('TocComponent — move', () => {
  it('into an expanded parent: the element is re-parented with correct nesting', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.expand('A');
    host.expand('A1');

    model.move('A2', 'A1');

    const a1List = host.querySelector('toc-node[data-node-id="A1"]')!.querySelector('ul')!;
    expect(a1List.querySelector('toc-node[data-node-id="A2"]')).toBeTruthy();
  });

  it('into a collapsed parent: the moved subtree is dropped, then rebuilt lazily on expand', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.expand('A'); // A2 now rendered

    model.move('A2', 'A1'); // A1 is currently collapsed

    expect(host.querySelector('toc-node[data-node-id="A2"]')).toBeNull();
    host.expand('A1');
    expect(host.querySelector('toc-node[data-node-id="A2"]')).toBeTruthy();
  });

  it('a cycle-creating move is rejected by the model; the widget does nothing', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.expand('A');
    host.expand('A1');

    expect(() => model.move('A1', 'A1a')).toThrow();

    expect(host.querySelector('toc-node[data-node-id="A1a"]')).toBeTruthy();
    const a1List = host.querySelector('toc-node[data-node-id="A"]')!.querySelector('ul')!;
    expect(a1List.querySelector('toc-node[data-node-id="A1"]')).toBeTruthy();
  });
});

describe('TocComponent — focus / input preserved by construction', () => {
  it('unrelated structural changes do not disturb a focused, partially-typed input', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model, (node) => {
      if (node.id !== 'A2') {
        const span = document.createElement('span');
        span.textContent = node.id;
        return span;
      }
      const input = document.createElement('input');
      input.value = 'hello';
      return input;
    });

    host.expand('A');
    const input = host.querySelector<HTMLInputElement>('toc-node[data-node-id="A2"] input')!;
    input.focus();
    input.value = 'hexllo';
    input.setSelectionRange(3, 3);

    host.expandAll();
    model.add({ id: 'B1', parent_id: 'B', type: 't' });
    host.collapse('A1');

    const sameInput = host.querySelector<HTMLInputElement>('toc-node[data-node-id="A2"] input')!;
    expect(sameInput).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('hexllo');
    expect(input.selectionStart).toBe(3);
  });
});

describe('TocComponent — events', () => {
  it('programmatic expand/collapse/expandAll/collapseAll emit only change, never clickToggle', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    const events: string[] = [];
    host.addEventListener(TocComponent.events.clickToggle, () => events.push('clickToggle'));
    host.addEventListener(TocComponent.events.change, () => events.push('change'));

    host.expand('A');
    host.expand('A1');
    host.collapse('A1');
    host.expandAll();
    host.collapseAll();

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e === 'change')).toBe(true);
  });

  it('change.detail.expanded is a snapshot of the currently expanded ids', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    let detail: ITocChangeDetail | null = null;
    host.addEventListener(TocComponent.events.change, (ev) => {
      detail = (ev as CustomEvent<ITocChangeDetail>).detail;
    });

    host.expand('A');
    expect(detail).toEqual({ expanded: ['A'] });

    host.expand('A1');
    expect(new Set(detail!.expanded)).toEqual(new Set(['A', 'A1']));
  });

  it('expand is a no-op for an unknown id or a childless (leaf) id — no change fires', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    let changeCount = 0;
    host.addEventListener(TocComponent.events.change, () => { changeCount += 1; });

    host.expand('does-not-exist');
    host.expand('A2');

    expect(changeCount).toBe(0);
  });
});

describe('TocComponent — setup and lifecycle', () => {
  it('setup can be called again with a new model, resetting expansion state and the DOM', () => {
    const model1 = new TocModel(sampleDefs());
    const host = mount(model1);
    host.expand('A');

    const model2 = new TocModel([{ id: 'Q', parent_id: null, type: 't' }]);
    host.setup(model2);

    expect(host.querySelectorAll('toc-node[data-node-id="Q"]').length).toBe(1);
    expect(host.querySelector('toc-node[data-node-id="A"]')).toBeNull();
  });

  it('stops reacting to model events once disconnected from the DOM', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.remove();

    expect(() => model.add({ id: 'Z', parent_id: null, type: 't' })).not.toThrow();
  });
});

describe('TocComponent — clear', () => {
  it('empties the widget and resets expansion state; new nodes render cleanly afterward', () => {
    const model = new TocModel(sampleDefs());
    const host = mount(model);
    host.expand('A');

    model.clear();
    expect(host.querySelectorAll('toc-node').length).toBe(0);

    model.add({ id: 'Z', parent_id: null, type: 't' });
    expect(host.querySelectorAll('toc-node[data-node-id="Z"]').length).toBe(1);
  });
});
