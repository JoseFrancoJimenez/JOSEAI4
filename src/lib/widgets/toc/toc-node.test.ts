import { describe, it, expect, afterEach } from 'vitest';
import { TocNodeElement, createTocNode } from './toc-node.ts';
import type { ITocNodeToggleDetail } from './toc-node.ts';

const ICON = '<svg class="toc-arrow"></svg>';

function makeContent(text = 'label'): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function build(opts: { id?: string; hasChildren?: boolean } = {}): TocNodeElement {
  const el = createTocNode({
    id: opts.id ?? 'A',
    hasChildren: opts.hasChildren ?? false,
    content: makeContent(),
    toggleIconHtml: ICON,
  });
  document.body.appendChild(el);
  return el;
}

function toggleBtn(el: TocNodeElement): HTMLButtonElement {
  return el.querySelector('.toc-toggle')!;
}

function contentEl(el: TocNodeElement): HTMLElement {
  return el.querySelector('.toc-content')!;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('TocNodeElement.configure', () => {
  it('builds a uniform row: toggle button + content wrapper, for both leaves and branches', () => {
    const leaf = build({ hasChildren: false });
    const branch = build({ id: 'B', hasChildren: true });
    for (const el of [leaf, branch]) {
      expect(toggleBtn(el)).toBeTruthy();
      expect(contentEl(el)).toBeTruthy();
      expect(contentEl(el).textContent).toBe('label');
    }
  });

  it('registers the node id for lookup via dataset', () => {
    const el = build({ id: 'X1' });
    expect(el.dataset.nodeId).toBe('X1');
    expect(el.nodeId).toBe('X1');
  });

  it('leaf: hides the toggle via class, marks aria-hidden, and sets no aria-expanded', () => {
    const el = build({ hasChildren: false });
    const btn = toggleBtn(el);
    expect(btn.classList.contains('toc-toggle--leaf')).toBe(true);
    expect(btn.getAttribute('aria-hidden')).toBe('true');
    expect(btn.hasAttribute('aria-expanded')).toBe(false);
    expect(contentEl(el).classList.contains('toc-content--expandable')).toBe(false);
  });

  it('branch: toggle is visible, aria-expanded starts false, content is marked expandable', () => {
    const el = build({ hasChildren: true });
    const btn = toggleBtn(el);
    expect(btn.classList.contains('toc-toggle--leaf')).toBe(false);
    expect(btn.hasAttribute('aria-hidden')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(contentEl(el).classList.contains('toc-content--expandable')).toBe(true);
  });
});

describe('TocNodeElement.setExpanded', () => {
  it('reflects expanded state as a class + aria-expanded on a branch', () => {
    const el = build({ hasChildren: true });
    el.setExpanded(true);
    expect(el.classList.contains('is-expanded')).toBe(true);
    expect(toggleBtn(el).classList.contains('is-expanded')).toBe(true);
    expect(toggleBtn(el).getAttribute('aria-expanded')).toBe('true');

    el.setExpanded(false);
    expect(el.classList.contains('is-expanded')).toBe(false);
    expect(toggleBtn(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('does not touch the (hidden) toggle button aria on a leaf', () => {
    const el = build({ hasChildren: false });
    el.setExpanded(true);
    expect(toggleBtn(el).hasAttribute('aria-expanded')).toBe(false);
  });
});

describe('TocNodeElement.setLeaf', () => {
  it('transitions a branch to a leaf and back, without changing the row shape', () => {
    const el = build({ hasChildren: true });
    el.setLeaf(true);
    expect(toggleBtn(el).classList.contains('toc-toggle--leaf')).toBe(true);
    expect(toggleBtn(el).getAttribute('aria-hidden')).toBe('true');
    expect(contentEl(el).classList.contains('toc-content--expandable')).toBe(false);

    el.setLeaf(false);
    expect(toggleBtn(el).classList.contains('toc-toggle--leaf')).toBe(false);
    expect(toggleBtn(el).hasAttribute('aria-hidden')).toBe(false);
    expect(contentEl(el).classList.contains('toc-content--expandable')).toBe(true);
    // becoming a branch while already expanded should reflect aria-expanded=true, not reset to false
    el.setExpanded(true);
    el.setLeaf(true);
    el.setLeaf(false);
    expect(toggleBtn(el).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('TocNodeElement child list', () => {
  it('creates the child <ul> lazily, on first access', () => {
    const el = build({ hasChildren: true });
    expect(el.querySelector('ul')).toBeNull();
    const list = el.childList;
    expect(el.querySelector('ul')).toBe(list);
    expect(list.className).toContain('toc-list');
    expect(list.className).toContain('toc-list--nested');
  });

  it('appendChildNode appends into the (lazily created) child list', () => {
    const parent = build({ id: 'P', hasChildren: true });
    const child = build({ id: 'C' });
    parent.appendChildNode(child);
    expect(Array.from(parent.childList.children)).toContain(child);
  });

  it('clearChildren removes the child list, and a later access rebuilds an empty one', () => {
    const parent = build({ id: 'P', hasChildren: true });
    const child = build({ id: 'C' });
    parent.appendChildNode(child);
    parent.clearChildren();
    expect(parent.querySelector('ul')).toBeNull();
    expect(child.isConnected).toBe(false);

    const fresh = parent.childList;
    expect(fresh.children.length).toBe(0);
  });
});

describe('TocNodeElement.detach', () => {
  it('removes the element (and its subtree, since children live inside it) from the DOM', () => {
    const parent = build({ id: 'P', hasChildren: true });
    const child = build({ id: 'C' });
    parent.appendChildNode(child);
    parent.detach();
    expect(parent.isConnected).toBe(false);
    expect(child.isConnected).toBe(false);
  });
});

describe('TocNodeElement toggle interaction', () => {
  it('clicking the toggle emits toc:node:toggle with the node id, without flipping its own state', () => {
    const el = build({ id: 'A', hasChildren: true });
    const events: ITocNodeToggleDetail[] = [];
    el.addEventListener(TocNodeElement.events.toggle, (ev) => {
      events.push((ev as CustomEvent<ITocNodeToggleDetail>).detail);
    });

    toggleBtn(el).click();

    expect(events).toEqual([{ id: 'A' }]);
    expect(el.classList.contains('is-expanded')).toBe(false); // widget decides, not the node
    expect(toggleBtn(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('the toggle event bubbles up so a widget can listen with one delegated listener', () => {
    const el = build({ id: 'A', hasChildren: true });
    let seen: ITocNodeToggleDetail | null = null;
    document.body.addEventListener(TocNodeElement.events.toggle, (ev) => {
      seen = (ev as CustomEvent<ITocNodeToggleDetail>).detail;
    });

    toggleBtn(el).click();

    expect(seen).toEqual({ id: 'A' });
  });

  it('clicking expandable content also emits toggle, for a branch', () => {
    const el = build({ id: 'A', hasChildren: true });
    const events: ITocNodeToggleDetail[] = [];
    el.addEventListener(TocNodeElement.events.toggle, (ev) => {
      events.push((ev as CustomEvent<ITocNodeToggleDetail>).detail);
    });

    contentEl(el).click();

    expect(events).toEqual([{ id: 'A' }]);
  });

  it('clicking content on a leaf does nothing (no children to expand)', () => {
    const el = build({ id: 'A', hasChildren: false });
    let count = 0;
    el.addEventListener(TocNodeElement.events.toggle, () => { count += 1; });

    contentEl(el).click();

    expect(count).toBe(0);
  });

  it('clicking an interactive control inside the content does not toggle', () => {
    const el = build({ id: 'A', hasChildren: true });
    const button = document.createElement('button');
    button.textContent = 'action';
    contentEl(el).appendChild(button);
    let count = 0;
    el.addEventListener(TocNodeElement.events.toggle, () => { count += 1; });

    button.click();

    expect(count).toBe(0);
  });
});
