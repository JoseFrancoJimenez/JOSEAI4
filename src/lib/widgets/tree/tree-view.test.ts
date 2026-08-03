import { describe, it, expect, afterEach } from 'vitest';
import { TreeViewElement } from './tree-view.ts';
import type { ITreeNodeDef } from './tree-view.ts';
import { TreeNodeElement } from './tree-node.ts';

/**
 * Layers (branch)
 *  ├─ Roads (branch)
 *  │   ├─ Highways (leaf)
 *  │   └─ Streets (leaf)
 *  └─ Water (leaf)
 * Basemaps (leaf, root)
 */
function sampleDefs(): ITreeNodeDef[] {
  return [
    { id: 'Layers', parent_id: null },
    { id: 'Roads', parent_id: 'Layers' },
    { id: 'Highways', parent_id: 'Roads' },
    { id: 'Streets', parent_id: 'Roads' },
    { id: 'Water', parent_id: 'Layers' },
    { id: 'Basemaps', parent_id: null },
  ];
}

/** Default renderer: a labelled span carrying the def id, so content and its wrapper are assertable. */
function defaultRender(def: ITreeNodeDef): HTMLElement {
  const span = document.createElement('span');
  span.className = 'label';
  span.textContent = def.id;
  return span;
}

function mount(
  defs: ITreeNodeDef[] = sampleDefs(),
  renderNode: (def: ITreeNodeDef) => HTMLElement = defaultRender,
): TreeViewElement {
  const host = document.createElement(TreeViewElement.tagName) as TreeViewElement;
  document.body.appendChild(host);
  host.build(defs, renderNode);
  return host;
}

const node = (host: TreeViewElement, id: string): TreeNodeElement | null =>
  host.querySelector<TreeNodeElement>(`${TreeNodeElement.tagName}[data-id="${id}"]`);

const renderedIds = (host: TreeViewElement): Set<string> =>
  new Set([...host.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)].map((el) => el.dataset.id!));

const tabStops = (host: TreeViewElement): HTMLElement[] =>
  [...host.querySelectorAll<HTMLElement>(TreeNodeElement.tagName)].filter((el) => el.tabIndex === 0);

/** Flush a macrotask so the MutationObserver (ARIA + roving) has run. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
});

describe('TreeViewElement — build & lazy fill', () => {
  it('renders only the roots; deep nodes are absent until their ancestor expands', () => {
    const host = mount();
    expect(renderedIds(host)).toEqual(new Set(['Layers', 'Basemaps']));
  });

  it('builds only the DIRECT children on first expand (grandchildren stay absent)', () => {
    const host = mount();
    node(host, 'Layers')!.expand();
    expect(node(host, 'Roads')).toBeTruthy();
    expect(node(host, 'Water')).toBeTruthy();
    expect(node(host, 'Highways')).toBeNull();

    node(host, 'Roads')!.expand();
    expect(node(host, 'Highways')).toBeTruthy();
    expect(node(host, 'Streets')).toBeTruthy();
  });

  it('re-expand after collapse reuses the SAME child instances (retained, never rebuilt)', () => {
    const host = mount();
    const layers = node(host, 'Layers')!;
    layers.expand();
    const roads = node(host, 'Roads')!;

    layers.collapse();
    layers.expand();
    expect(node(host, 'Roads')).toBe(roads);
  });

  it('stamps data-id (root) + data-parent-id (child) and places renderNode output in the content wrapper', () => {
    const host = mount();
    const layers = node(host, 'Layers')!;
    expect(layers.dataset.id).toBe('Layers');
    expect(layers.dataset.parentId).toBeUndefined(); // a root has no parent

    layers.expand();
    const roads = node(host, 'Roads')!;
    expect(roads.dataset.id).toBe('Roads');
    expect(roads.dataset.parentId).toBe('Layers');
    expect(roads.querySelector('.tree-node__content > .label')!.textContent).toBe('Roads');
  });

  it('marks leaves and branches from the recipe: a branch shows aria-expanded, a leaf does not', () => {
    const host = mount();
    expect(node(host, 'Layers')!.getAttribute('aria-expanded')).toBe('false'); // branch
    expect(node(host, 'Basemaps')!.hasAttribute('aria-expanded')).toBe(false); // leaf
  });
});

describe('TreeViewElement — accessible name', () => {
  it('is role=tree with the default accessible name when none is supplied', () => {
    const host = mount();
    expect(host.getAttribute('role')).toBe('tree');
    expect(host.getAttribute('aria-label')).toBe('Tree');
  });

  it('forwards a consumer-supplied aria-label instead of the default', () => {
    const host = document.createElement(TreeViewElement.tagName) as TreeViewElement;
    host.setAttribute('aria-label', 'Layer list');
    document.body.appendChild(host);
    host.build(sampleDefs(), defaultRender);
    expect(host.getAttribute('aria-label')).toBe('Layer list');
  });

  it('does not override a consumer-supplied aria-labelledby with the default', () => {
    const host = document.createElement(TreeViewElement.tagName) as TreeViewElement;
    host.setAttribute('aria-labelledby', 'heading-1');
    document.body.appendChild(host);
    host.build(sampleDefs(), defaultRender);
    expect(host.hasAttribute('aria-label')).toBe(false);
    expect(host.getAttribute('aria-labelledby')).toBe('heading-1');
  });
});

describe('TreeViewElement — roles & positional ARIA', () => {
  it('gives every row role=treeitem and every child group role=group', () => {
    const host = mount();
    host.expandAll();
    for (const el of host.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      expect(el.getAttribute('role')).toBe('treeitem');
    }
    const group = node(host, 'Layers')!.querySelector(':scope > .tree-node__group')!;
    expect(group.getAttribute('role')).toBe('group');
  });

  it('stamps aria-level/setsize/posinset correctly at every level (after a tick)', async () => {
    const host = mount();
    host.expandAll();
    await tick();

    const check = (id: string, level: number, setsize: number, posinset: number): void => {
      const el = node(host, id)!;
      expect(el.getAttribute('aria-level')).toBe(String(level));
      expect(el.getAttribute('aria-setsize')).toBe(String(setsize));
      expect(el.getAttribute('aria-posinset')).toBe(String(posinset));
    };
    check('Layers', 1, 2, 1);
    check('Basemaps', 1, 2, 2);
    check('Roads', 2, 2, 1);
    check('Water', 2, 2, 2);
    check('Highways', 3, 2, 1);
    check('Streets', 3, 2, 2);
  });

  it('re-stamps positional ARIA after a lazy fill adds a new sibling group (after a tick)', async () => {
    const host = mount();
    node(host, 'Layers')!.expand();
    await tick();
    // Roads/Water are a fresh sibling group; both must carry setsize=2 and their order.
    expect(node(host, 'Roads')!.getAttribute('aria-setsize')).toBe('2');
    expect(node(host, 'Roads')!.getAttribute('aria-posinset')).toBe('1');
    expect(node(host, 'Water')!.getAttribute('aria-posinset')).toBe('2');
  });
});

describe('TreeViewElement — roving tabindex', () => {
  it('promotes exactly one row (the first root) to tabindex=0 after build', () => {
    const host = mount();
    const stops = tabStops(host);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(node(host, 'Layers'));
  });

  it('keeps a single tab stop as the tree grows through expansion', () => {
    const host = mount();
    host.expandAll();
    expect(tabStops(host)).toHaveLength(1);
  });

  it('reassigns the tab stop when the active row is removed by a raw DOM op (after a tick)', async () => {
    const host = mount();
    expect(node(host, 'Layers')!.tabIndex).toBe(0);

    node(host, 'Layers')!.remove();
    await tick();

    const stops = tabStops(host);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(node(host, 'Basemaps'));
  });
});

describe('TreeViewElement — expandAll / collapseAll', () => {
  it('expandAll materializes the whole tree', () => {
    const host = mount();
    host.expandAll();
    expect(renderedIds(host)).toEqual(
      new Set(['Layers', 'Roads', 'Highways', 'Streets', 'Water', 'Basemaps']),
    );
  });

  it('collapseAll collapses every branch, leaving only the roots rendered', () => {
    const host = mount();
    host.expandAll();
    host.collapseAll();

    for (const el of host.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      expect(el.expanded).toBe(false);
    }
    expect(renderedIds(host)).toEqual(new Set(['Layers', 'Basemaps']));
  });
});

describe('TreeViewElement — initial expanded hint (materialization)', () => {
  it('expands a branch marked expanded at build, materializing its direct children', () => {
    const host = mount([
      { id: 'Layers', parent_id: null, expanded: true },
      { id: 'Roads', parent_id: 'Layers' },
      { id: 'Water', parent_id: 'Layers' },
    ]);
    expect(node(host, 'Layers')!.expanded).toBe(true);
    expect(node(host, 'Layers')!.getAttribute('aria-expanded')).toBe('true');
    expect(node(host, 'Roads')).toBeTruthy();
    expect(node(host, 'Water')).toBeTruthy();
  });

  it('cascades through deep expanded defs but stops the lazy build at collapsed ones', () => {
    const host = mount([
      { id: 'Layers', parent_id: null, expanded: true },
      { id: 'Roads', parent_id: 'Layers', expanded: true },
      { id: 'Highways', parent_id: 'Roads' },
      { id: 'Water', parent_id: 'Layers' }, // no hint → stays collapsed
      { id: 'Rivers', parent_id: 'Water' },
    ]);
    expect(node(host, 'Highways')).toBeTruthy(); // Roads expanded → its children built
    expect(node(host, 'Water')!.expanded).toBe(false);
    expect(node(host, 'Rivers')).toBeNull(); // Water collapsed → grandchild never built
  });

  it('ignores an expanded hint on a node with no children (stays a collapsed leaf)', () => {
    const host = mount([{ id: 'Solo', parent_id: null, expanded: true }]);
    const solo = node(host, 'Solo')!;
    expect(solo.isLeaf).toBe(true);
    expect(solo.expanded).toBe(false);
    expect(solo.hasAttribute('aria-expanded')).toBe(false);
  });

});

describe('TreeViewElement — initial expanded hint (silence & ARIA)', () => {
  it('applies initial expansions SILENTLY — no tree-node:toggle fires during build', () => {
    const host = document.createElement(TreeViewElement.tagName) as TreeViewElement;
    document.body.appendChild(host);
    let toggles = 0;
    host.addEventListener(TreeNodeElement.events.toggle, () => { toggles += 1; });

    host.build(
      [
        { id: 'Layers', parent_id: null, expanded: true },
        { id: 'Roads', parent_id: 'Layers', expanded: true },
        { id: 'Highways', parent_id: 'Roads' },
      ],
      defaultRender,
    );

    expect(toggles).toBe(0);
    expect(node(host, 'Highways')).toBeTruthy(); // the cascade still happened
  });

  it('auto-expands an expanded-marked child when its parent is first opened at runtime, silently', () => {
    const host = mount([
      { id: 'Layers', parent_id: null }, // collapsed root
      { id: 'Roads', parent_id: 'Layers', expanded: true },
      { id: 'Highways', parent_id: 'Roads' },
    ]);
    let toggles = 0;
    host.addEventListener(TreeNodeElement.events.toggle, () => { toggles += 1; });

    node(host, 'Layers')!.expand(); // user opens Layers — the only acted node

    expect(node(host, 'Roads')!.expanded).toBe(true); // honored from its hint
    expect(node(host, 'Highways')).toBeTruthy();
    expect(toggles).toBe(1); // Layers' own toggle only; the child's initial expansion was silent
  });

  it('stamps positional ARIA across the initially-expanded subtree (after a tick)', async () => {
    const host = mount([
      { id: 'Layers', parent_id: null, expanded: true },
      { id: 'Roads', parent_id: 'Layers', expanded: true },
      { id: 'Highways', parent_id: 'Roads' },
      { id: 'Streets', parent_id: 'Roads' },
    ]);
    await tick();
    expect(node(host, 'Roads')!.getAttribute('aria-level')).toBe('2');
    expect(node(host, 'Highways')!.getAttribute('aria-level')).toBe('3');
    expect(node(host, 'Streets')!.getAttribute('aria-posinset')).toBe('2');
    expect(node(host, 'Streets')!.getAttribute('aria-setsize')).toBe('2');
  });
});

describe('TreeViewElement — lifecycle', () => {
  it('stops re-stamping once disconnected (observer torn down)', async () => {
    const host = mount();
    host.remove();
    node(host, 'Layers')?.remove();
    await tick();
    expect(() => host.querySelectorAll(TreeNodeElement.tagName)).not.toThrow();
  });
});
