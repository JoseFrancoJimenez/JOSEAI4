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

function fireKey(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function checkboxSpan(node: TreeNodeElement): HTMLElement {
  return node.rowEl.querySelector<HTMLElement>(':scope > .tree-node__checkbox')!;
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

describe('CheckboxTreeElement — keyboard: Up/Down navigation', () => {
  it('moves through visible rows only, skipping rows under a collapsed ancestor, and clamps at both ends', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs');
    docs.expand(); // reports stays collapsed — q1/q2 are not visible

    docs.focus();
    fireKey(docs, 'ArrowDown');
    expect(document.activeElement).toBe(byId(tree, 'reports'));

    fireKey(byId(tree, 'reports'), 'ArrowDown');
    expect(document.activeElement).toBe(byId(tree, 'images')); // q1/q2 skipped

    fireKey(byId(tree, 'images'), 'ArrowDown');
    expect(document.activeElement).toBe(byId(tree, 'archive'));

    fireKey(byId(tree, 'archive'), 'ArrowDown'); // clamp — last row
    expect(document.activeElement).toBe(byId(tree, 'archive'));

    fireKey(byId(tree, 'archive'), 'ArrowUp');
    expect(document.activeElement).toBe(byId(tree, 'images'));

    fireKey(byId(tree, 'images'), 'ArrowUp');
    expect(document.activeElement).toBe(byId(tree, 'reports'));

    fireKey(byId(tree, 'reports'), 'ArrowUp');
    expect(document.activeElement).toBe(docs);

    fireKey(docs, 'ArrowUp'); // clamp — first row
    expect(document.activeElement).toBe(docs);
  });
});

describe('CheckboxTreeElement — keyboard: Home/End', () => {
  it('Home focuses the first row, End focuses the last visible row', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const archive = byId(tree, 'archive');
    archive.focus();
    fireKey(archive, 'Home');
    expect(document.activeElement).toBe(byId(tree, 'docs'));
    fireKey(byId(tree, 'docs'), 'End');
    expect(document.activeElement).toBe(archive);
  });
});

describe('CheckboxTreeElement — keyboard: Right/Left', () => {
  it('Right expands a collapsed branch (focus stays), then descends on the next Right; no-op on a leaf', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs');
    docs.focus();
    fireKey(docs, 'ArrowRight');
    expect(docs.expanded).toBe(true);
    expect(document.activeElement).toBe(docs);

    fireKey(docs, 'ArrowRight');
    expect(document.activeElement).toBe(byId(tree, 'reports'));

    const images = byId(tree, 'images');
    images.focus();
    fireKey(images, 'ArrowRight');
    expect(document.activeElement).toBe(images);
    expect(images.hasAttribute('aria-expanded')).toBe(false);
  });

  it('Left collapses an expanded branch (focus stays), then ascends on the next Left; no-op at a root', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs');
    docs.expand();
    const reports = byId(tree, 'reports');
    reports.focus();

    fireKey(reports, 'ArrowLeft'); // reports collapsed — ascend
    expect(document.activeElement).toBe(docs);

    fireKey(docs, 'ArrowLeft'); // docs expanded — collapse, focus stays
    expect(docs.expanded).toBe(false);
    expect(document.activeElement).toBe(docs);

    fireKey(docs, 'ArrowLeft'); // root, no parent — no-op
    expect(document.activeElement).toBe(docs);
  });
});

describe('CheckboxTreeElement — Enter/Space toggles checked (primary action)', () => {
  it('a leaf flips aria-checked and emits checkbox-tree:change with the new checkedLeafIds', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const archive = byId(tree, 'archive');
    let detail: { checkedLeafIds: string[]; nodeId: string; checked: boolean } | null = null;
    tree.addEventListener(CheckboxTreeElement.events.change, (ev) => {
      detail = (ev as CustomEvent<typeof detail>).detail;
    });
    archive.focus();
    fireKey(archive, ' ');
    expect(archive.getAttribute('aria-checked')).toBe('true');
    expect(checkboxSpan(archive).dataset.state).toBe('checked');
    expect(detail).toEqual({ checkedLeafIds: ['archive'], nodeId: 'archive', checked: true });
  });

  it("a group in 'all' mode cascades to all descendant leaves and updates its own aria-checked", () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const reports = byId(tree, 'reports');
    reports.focus();
    fireKey(reports, 'Enter');
    expect(tree.getChecked().sort()).toEqual(['q1', 'q2']);
    expect(reports.getAttribute('aria-checked')).toBe('true');
    expect(byId(tree, 'q1').getAttribute('aria-checked')).toBe('true');
    expect(byId(tree, 'q2').getAttribute('aria-checked')).toBe('true');
  });

  it("a group in 'leaves' mode expands and emits nothing", () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel, { checkable: 'leaves' as Checkable });
    const docs = byId(tree, 'docs');
    let fired = false;
    tree.addEventListener(CheckboxTreeElement.events.change, () => { fired = true; });
    docs.focus();
    fireKey(docs, ' ');
    expect(docs.expanded).toBe(true);
    expect(fired).toBe(false);
  });
});

describe('CheckboxTreeElement — click', () => {
  it('clicking the checkbox behaves like Space', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const archive = byId(tree, 'archive');
    checkboxSpan(archive).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(archive.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking the content toggles expand/collapse, not checked', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs');
    docs.contentEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(docs.expanded).toBe(true);
    expect(docs.getAttribute('aria-checked')).toBe('false');
  });
});

describe('CheckboxTreeElement — tri-state reflection', () => {
  it('checking every child flips the parent (and ancestors) to checked; unchecking one flips it to mixed', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const reports = byId(tree, 'reports');
    const q1 = byId(tree, 'q1');
    const q2 = byId(tree, 'q2');
    const docs = byId(tree, 'docs');

    q1.focus(); fireKey(q1, ' ');
    q2.focus(); fireKey(q2, ' ');
    expect(reports.getAttribute('aria-checked')).toBe('true');
    expect(checkboxSpan(reports).dataset.state).toBe('checked');
    expect(docs.getAttribute('aria-checked')).toBe('mixed'); // images still unchecked

    q1.focus(); fireKey(q1, ' '); // uncheck q1
    expect(reports.getAttribute('aria-checked')).toBe('mixed');
    expect(checkboxSpan(reports).dataset.state).toBe('mixed');
    expect(docs.getAttribute('aria-checked')).toBe('mixed');
  });
});

describe('CheckboxTreeElement — setChecked / getChecked (uncontrolled contract)', () => {
  it('setChecked reflects checked/mixed visuals and does not emit', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    let fired = false;
    tree.addEventListener(CheckboxTreeElement.events.change, () => { fired = true; });

    tree.setChecked(['q1']);
    expect(byId(tree, 'q1').getAttribute('aria-checked')).toBe('true');
    expect(byId(tree, 'reports').getAttribute('aria-checked')).toBe('mixed');
    expect(byId(tree, 'docs').getAttribute('aria-checked')).toBe('mixed');
    expect(fired).toBe(false);
  });

  it('getChecked returns the current set', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    tree.setChecked(['q1', 'archive']);
    expect(tree.getChecked().sort()).toEqual(['archive', 'q1']);
  });
});

describe('CheckboxTreeElement — interactiveSelector guard', () => {
  it('keys are suppressed when focus is inside injected interactive content', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const archive = byId(tree, 'archive');
    const link = document.createElement('a');
    link.href = '#';
    archive.contentEl.appendChild(link);

    link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(archive.getAttribute('aria-checked')).toBe('false');
    expect(tree.getChecked()).toEqual([]);
  });
});

describe('CheckboxTreeElement — roving tab stop stays singular', () => {
  it('keeps exactly one tabindex=0 after navigation and toggling', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs');
    docs.focus();
    fireKey(docs, 'ArrowRight');
    fireKey(docs, 'ArrowDown');
    fireKey(byId(tree, 'reports'), ' ');

    expect(allNodes(tree).filter((n) => n.tabIndex === 0)).toHaveLength(1);
  });
});

describe('CheckboxTreeElement — toggling is surgical', () => {
  it('nodes outside the affected subtree/ancestors are untouched', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const reports = byId(tree, 'reports');
    reports.focus();
    fireKey(reports, ' ');
    expect(byId(tree, 'images').getAttribute('aria-checked')).toBe('false');
    expect(byId(tree, 'archive').getAttribute('aria-checked')).toBe('false');
  });
});
