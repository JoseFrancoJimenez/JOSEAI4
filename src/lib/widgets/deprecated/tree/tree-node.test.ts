import { describe, it, expect, afterEach } from 'vitest';
import { TreeNodeElement, createTreeNode } from './tree-node.ts';
import type { ITreeNodeToggleDetail } from './tree-node.ts';

function makeContent(text = 'label'): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

/** Builds a node (a leaf by default) and attaches it to the document. */
function build(content: HTMLElement = makeContent()): TreeNodeElement {
  const el = createTreeNode(content);
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
const contentEl = (el: TreeNodeElement): HTMLElement => el.querySelector(':scope > .tree-node__row > .tree-node__content')!;
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
  it('renders a uniform row (role=treeitem, toggle + content) for both leaf and branch', () => {
    for (const el of [build(), branch(createTreeNode(makeContent('c')))]) {
      expect(el.getAttribute('role')).toBe('treeitem');
      expect(toggleEl(el)).toBeTruthy();
      expect(contentEl(el)).toBeTruthy();
    }
  });

  it('places the injected content in the wrapper and names the row via aria-labelledby', () => {
    const content = makeContent('Roads');
    const el = build(content);
    const wrapper = contentEl(el);
    expect(wrapper.contains(content)).toBe(true);
    expect(wrapper.id).toBeTruthy();
    expect(el.getAttribute('aria-labelledby')).toBe(wrapper.id);
  });

  it('gives each row a unique content id, so accessible names never collide', () => {
    expect(contentEl(build()).id).not.toBe(contentEl(build()).id);
  });

  it('baseline tabindex is -1 (the container promotes exactly one row to 0)', () => {
    expect(build().tabIndex).toBe(-1);
    expect(branch(createTreeNode(makeContent())).tabIndex).toBe(-1);
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
    const el = branch(createTreeNode(makeContent()));
    el.expand();
    el.setLeaf(true);
    el.setLeaf(false);
    expect(el.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('TreeNodeElement — expand / collapse / retain', () => {
  it('expand attaches the child group (role=group) and sets aria-expanded true', () => {
    const child = createTreeNode(makeContent('c'));
    const el = branch(child);
    expect(groupEl(el)).toBeNull(); // group exists but is detached while collapsed

    el.expand();
    expect(el.expanded).toBe(true);
    expect(el.getAttribute('aria-expanded')).toBe('true');
    const group = groupEl(el)!;
    expect(group).toBeTruthy();
    expect(group.getAttribute('role')).toBe('group');
    expect(group.contains(child)).toBe(true);
  });

  it('collapse detaches the group; re-expand re-attaches the SAME child instances (retain, never rebuild)', () => {
    const child = createTreeNode(makeContent('c'));
    const el = branch(child);

    el.expand();
    el.collapse();
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(groupEl(el)).toBeNull();

    el.expand();
    expect(groupEl(el)!.contains(child)).toBe(true);
  });

  it('retains injected input value + caret across a collapse→expand cycle', () => {
    const input = document.createElement('input');
    const el = branch(createTreeNode(input));

    el.expand();
    input.value = 'hello';
    input.setSelectionRange(2, 2);

    el.collapse();
    el.expand();

    expect(input.value).toBe('hello');
    expect(input.selectionStart).toBe(2);
  });
});

describe('TreeNodeElement — toggle interaction & events', () => {
  it('toggle(), toggle-click, and content-click each emit tree-node:toggle with {expanded} on a branch', () => {
    const t = branch(createTreeNode(makeContent()));
    const seen = toggleDetails(t);
    t.toggle();                       // expand
    toggleEl(t).click();              // collapse
    contentEl(t).click();             // expand
    expect(seen).toEqual([{ expanded: true }, { expanded: false }, { expanded: true }]);
  });

  it('the toggle event bubbles, so a container can listen once', () => {
    const el = branch(createTreeNode(makeContent()));
    let detail: ITreeNodeToggleDetail | null = null;
    document.body.addEventListener(TreeNodeElement.events.toggle, (ev) => {
      detail = (ev as CustomEvent<ITreeNodeToggleDetail>).detail;
    });
    el.toggle();
    expect(detail).toEqual({ expanded: true });
  });

  it('a leaf does nothing on toggle() or content-click (no children to expand, no event)', () => {
    const el = build();
    const seen = toggleDetails(el);
    el.toggle();
    contentEl(el).click();
    expect(seen).toEqual([]);
    expect(el.expanded).toBe(false);
  });

  it('clicking an interactive control inside the content does not toggle', () => {
    const content = document.createElement('div');
    const btn = document.createElement('button');
    content.appendChild(btn);
    const el = build(content);
    el.setLeaf(false);
    const seen = toggleDetails(el);
    btn.click();
    expect(seen).toEqual([]);
    expect(el.expanded).toBe(false);
  });
});
