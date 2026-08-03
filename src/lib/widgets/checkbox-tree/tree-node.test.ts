import { describe, it, expect, afterEach } from 'vitest';
import { TreeNodeElement, createTreeNode } from './tree-node.ts';
import type { ITreeNodeToggleDetail } from './tree-node.ts';

/** Builds a node (a leaf by default) and attaches it to the document. */
function build(label = 'label'): TreeNodeElement {
  const el = createTreeNode(label);
  document.body.appendChild(el);
  return el;
}

/** Builds a branch (leaf flag cleared) with `children` appended into its group. */
function branch(...children: TreeNodeElement[]): TreeNodeElement {
  const el = build();
  el.setLeaf(false);
  for (const c of children) el.appendChildNode(c);
  return el;
}

const toggleEl = (el: TreeNodeElement): HTMLElement => el.querySelector(':scope > .tree-node__row > .tree-node__toggle')!;
const checkboxEl = (el: TreeNodeElement): HTMLElement | null => el.querySelector(':scope > .tree-node__row > .tree-node__checkbox');
const groupEl = (el: TreeNodeElement): HTMLElement | null => el.querySelector(':scope > .tree-node__group');

function toggleDetails(el: TreeNodeElement): ITreeNodeToggleDetail[] {
  const seen: ITreeNodeToggleDetail[] = [];
  el.addEventListener(TreeNodeElement.events.toggle, (ev) => seen.push((ev as CustomEvent<ITreeNodeToggleDetail>).detail));
  return seen;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('TreeNodeElement — row structure', () => {
  it('renders a uniform row (role=treeitem, toggle + content, no checkbox) for both leaf and branch', () => {
    for (const el of [build(), branch(createTreeNode('c'))]) {
      expect(el.getAttribute('role')).toBe('treeitem');
      expect(toggleEl(el)).toBeTruthy();
      expect(el.contentEl).toBeTruthy();
      expect(checkboxEl(el)).toBeNull();
    }
  });

  it('places the label as textContent and names the row via aria-labelledby', () => {
    const el = build('Roads');
    expect(el.contentEl.textContent).toBe('Roads');
    expect(el.contentEl.id).toBeTruthy();
    expect(el.getAttribute('aria-labelledby')).toBe(el.contentEl.id);
  });

  it('gives each row a unique content id, so accessible names never collide', () => {
    expect(build().contentEl.id).not.toBe(build().contentEl.id);
  });

  it('rowEl/contentEl return the row flex container and the label wrapper', () => {
    const el = build('x');
    expect(el.rowEl.classList.contains('tree-node__row')).toBe(true);
    expect(el.rowEl.contains(el.contentEl)).toBe(true);
  });

  it('baseline tabindex is -1 (the container promotes exactly one row to 0)', () => {
    expect(build().tabIndex).toBe(-1);
    expect(branch(createTreeNode('c')).tabIndex).toBe(-1);
  });
});

describe('TreeNodeElement — setLeaf', () => {
  it('leaf: marked is-leaf, no aria-expanded', () => {
    const el = build();
    expect(el.isLeaf).toBe(true);
    expect(el.classList.contains('is-leaf')).toBe(true);
    expect(el.hasAttribute('aria-expanded')).toBe(false);
  });

  it('branch: not is-leaf, aria-expanded starts false', () => {
    const el = build();
    el.setLeaf(false);
    expect(el.isLeaf).toBe(false);
    expect(el.classList.contains('is-leaf')).toBe(false);
    expect(el.getAttribute('aria-expanded')).toBe('false');
  });

  it('reflecting leaf again after expand preserves aria-expanded=true (branch → leaf → branch)', () => {
    const el = branch(createTreeNode('c'));
    el.expand();
    el.setLeaf(true);
    el.setLeaf(false);
    expect(el.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('TreeNodeElement — expand / collapse (eager: group stays in the DOM)', () => {
  it('a group exists in the DOM even before expand (eager build)', () => {
    const child = createTreeNode('c');
    const el = branch(child);
    const group = groupEl(el)!;
    expect(group).toBeTruthy();
    expect(group.getAttribute('role')).toBe('group');
    expect(group.contains(child)).toBe(true);
  });

  it('expand sets aria-expanded true and emits toggle; group is unchanged (never detached)', () => {
    const el = branch(createTreeNode('c'));
    const seen = toggleDetails(el);
    el.expand();
    expect(el.expanded).toBe(true);
    expect(el.getAttribute('aria-expanded')).toBe('true');
    expect(seen).toEqual([{ expanded: true }]);
  });

  it('collapse sets aria-expanded false and emits toggle; group stays attached', () => {
    const el = branch(createTreeNode('c'));
    el.expand();
    const seen = toggleDetails(el);
    el.collapse();
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(groupEl(el)).toBeTruthy();
    expect(seen).toEqual([{ expanded: false }]);
  });

  it('toggleExpand funnels expand/collapse; no-op on a leaf', () => {
    const el = branch(createTreeNode('c'));
    el.toggleExpand();
    expect(el.expanded).toBe(true);
    el.toggleExpand();
    expect(el.expanded).toBe(false);

    const leaf = build();
    const seen = toggleDetails(leaf);
    leaf.toggleExpand();
    expect(seen).toEqual([]);
    expect(leaf.expanded).toBe(false);
  });
});

describe('TreeNodeElement — appendChildNode', () => {
  it('places children into a role=group container', () => {
    const child = createTreeNode('c');
    const el = branch(child);
    const group = groupEl(el)!;
    expect(group.children.length).toBe(1);
    expect(group.firstElementChild).toBe(child);
    expect(el.childCount).toBe(1);
  });
});
