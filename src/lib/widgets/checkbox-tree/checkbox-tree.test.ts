import { describe, it, expect, afterEach } from 'vitest';
import { CheckboxTreeElement } from './checkbox-tree.ts';
import type { ITreeDef, Checkable } from './checkbox-tree.ts';
import { TreeNodeElement } from './tree-node.ts';

interface IDef extends ITreeDef {
  id: string;
  parent_id: string | null;
}

/**
 * docs (branch, root)
 *   reports (branch)
 *     q1 (leaf)
 *     q2 (leaf)
 *   images (leaf)
 * archive (leaf, root)
 */
function sampleDefs(): IDef[] {
  return [
    { id: 'docs', parent_id: null },
    { id: 'reports', parent_id: 'docs' },
    { id: 'q1', parent_id: 'reports' },
    { id: 'q2', parent_id: 'reports' },
    { id: 'images', parent_id: 'docs' },
    { id: 'archive', parent_id: null },
  ];
}

function getLabel(def: IDef): string {
  return def.id;
}

function mount(): CheckboxTreeElement {
  const el = document.createElement(CheckboxTreeElement.tagName) as CheckboxTreeElement;
  document.body.appendChild(el);
  return el;
}

function byId(tree: CheckboxTreeElement, id: string): TreeNodeElement {
  return tree.querySelector<TreeNodeElement>(`[data-id="${id}"]`)!;
}

function allNodes(tree: CheckboxTreeElement): TreeNodeElement[] {
  return [...tree.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)];
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('CheckboxTreeElement — build (structure)', () => {
  it('renders every node at every level', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const ids = allNodes(tree).map((n) => n.dataset.id).sort();
    expect(ids).toEqual(['archive', 'docs', 'images', 'q1', 'q2', 'reports'].sort());
  });

  it('branches are marked not-leaf with children in a role=group; leaves have none', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    expect(byId(tree, 'docs').isLeaf).toBe(false);
    expect(byId(tree, 'reports').isLeaf).toBe(false);
    expect(byId(tree, 'q1').isLeaf).toBe(true);
    expect(byId(tree, 'archive').isLeaf).toBe(true);

    const group = byId(tree, 'docs').querySelector(':scope > .tree-node__group')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.contains(byId(tree, 'reports'))).toBe(true);
    expect(group.contains(byId(tree, 'images'))).toBe(true);
  });

  it('every row is role=treeitem', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    for (const node of allNodes(tree)) expect(node.getAttribute('role')).toBe('treeitem');
  });

  it('branches start collapsed', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    expect(byId(tree, 'docs').expanded).toBe(false);
    expect(byId(tree, 'reports').expanded).toBe(false);
  });
});

describe('CheckboxTreeElement — role + accessible name', () => {
  it('sets role=tree and a default aria-label', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    expect(tree.getAttribute('role')).toBe('tree');
    expect(tree.getAttribute('aria-label')).toBe('Tree');
  });

  it('forwards a consumer-supplied aria-label instead of the default', () => {
    const tree = mount();
    tree.setAttribute('aria-label', 'People');
    tree.build(sampleDefs(), getLabel);
    expect(tree.getAttribute('aria-label')).toBe('People');
  });
});

describe('CheckboxTreeElement — positional ARIA', () => {
  it('stamps aria-level/aria-setsize/aria-posinset correctly at every level', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);

    const docs = byId(tree, 'docs');
    const archive = byId(tree, 'archive');
    expect(docs.getAttribute('aria-level')).toBe('1');
    expect(docs.getAttribute('aria-setsize')).toBe('2');
    expect(docs.getAttribute('aria-posinset')).toBe('1');
    expect(archive.getAttribute('aria-level')).toBe('1');
    expect(archive.getAttribute('aria-posinset')).toBe('2');

    const reports = byId(tree, 'reports');
    const images = byId(tree, 'images');
    expect(reports.getAttribute('aria-level')).toBe('2');
    expect(reports.getAttribute('aria-setsize')).toBe('2');
    expect(reports.getAttribute('aria-posinset')).toBe('1');
    expect(images.getAttribute('aria-level')).toBe('2');
    expect(images.getAttribute('aria-posinset')).toBe('2');

    const q1 = byId(tree, 'q1');
    const q2 = byId(tree, 'q2');
    expect(q1.getAttribute('aria-level')).toBe('3');
    expect(q1.getAttribute('aria-setsize')).toBe('2');
    expect(q1.getAttribute('aria-posinset')).toBe('1');
    expect(q2.getAttribute('aria-posinset')).toBe('2');
  });
});

describe('CheckboxTreeElement — label wiring', () => {
  it('places the label text and wires aria-labelledby with unique ids', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs');
    const archive = byId(tree, 'archive');
    expect(docs.contentEl.textContent).toBe('docs');
    expect(docs.getAttribute('aria-labelledby')).toBe(docs.contentEl.id);
    expect(docs.contentEl.id).not.toBe(archive.contentEl.id);
  });
});

describe("CheckboxTreeElement — checkable: 'all' (default)", () => {
  it('every node gets a checkbox span + aria-checked=false', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    for (const node of allNodes(tree)) {
      const span = node.rowEl.querySelector<HTMLElement>(':scope > .tree-node__checkbox');
      expect(span).toBeTruthy();
      expect(span!.dataset.state).toBe('unchecked');
      expect(span!.getAttribute('aria-hidden')).toBe('true');
      expect(node.getAttribute('aria-checked')).toBe('false');
    }
  });
});

describe("CheckboxTreeElement — checkable: 'leaves'", () => {
  it('only leaves get a checkbox + aria-checked; groups get neither', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel, { checkable: 'leaves' as Checkable });

    for (const leafId of ['q1', 'q2', 'images', 'archive']) {
      const node = byId(tree, leafId);
      expect(node.rowEl.querySelector(':scope > .tree-node__checkbox')).toBeTruthy();
      expect(node.getAttribute('aria-checked')).toBe('false');
    }
    for (const groupId of ['docs', 'reports']) {
      const node = byId(tree, groupId);
      expect(node.rowEl.querySelector(':scope > .tree-node__checkbox')).toBeNull();
      expect(node.hasAttribute('aria-checked')).toBe(false);
    }
  });
});

describe('CheckboxTreeElement — roving tab stop', () => {
  it('exactly one row has tabindex=0 after build', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const tabbable = allNodes(tree).filter((n) => n.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });
});

describe('CheckboxTreeElement — expandAll / collapseAll', () => {
  it('expandAll flips every branch to aria-expanded=true; leaves stay without the attribute', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    tree.expandAll();
    expect(byId(tree, 'docs').getAttribute('aria-expanded')).toBe('true');
    expect(byId(tree, 'reports').getAttribute('aria-expanded')).toBe('true');
    expect(byId(tree, 'q1').hasAttribute('aria-expanded')).toBe(false);
  });

  it('collapseAll flips every branch back to aria-expanded=false', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    tree.expandAll();
    tree.collapseAll();
    expect(byId(tree, 'docs').getAttribute('aria-expanded')).toBe('false');
    expect(byId(tree, 'reports').getAttribute('aria-expanded')).toBe('false');
  });
});
