import { describe, it, expect, afterEach } from 'vitest';
import { CheckboxTreeElement } from './checkbox-tree.ts';
import type { ITreeDef } from './checkbox-tree.ts';
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

/** Same shape as {@link sampleDefs}, but every node placed with a checkbox — the baseline most toggle/mutation tests build on. */
function checkableDefs(): IDef[] {
  return sampleDefs().map((def) => ({ ...def, type: 'checkbox' }));
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

function checkboxSpan(node: TreeNodeElement): HTMLElement | null {
  return node.rowEl.querySelector<HTMLElement>(':scope > .tree-node__checkbox');
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

describe('CheckboxTreeElement — checkbox placement (type), default', () => {
  it('a def with no type renders no checkbox anywhere (default is label)', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    for (const node of allNodes(tree)) {
      expect(checkboxSpan(node)).toBeNull();
      expect(node.hasAttribute('aria-checked')).toBe(false);
    }
  });

  it("type: 'checkbox' on every def renders a checkbox span + aria-checked=false on every node, leaf and branch alike", () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    for (const node of allNodes(tree)) {
      const span = checkboxSpan(node);
      expect(span).toBeTruthy();
      expect(span!.dataset.state).toBe('unchecked');
      expect(span!.getAttribute('aria-hidden')).toBe('true');
      expect(node.getAttribute('aria-checked')).toBe('false');
    }
  });
});

describe('CheckboxTreeElement — checkbox placement (type), per-node control', () => {
  it("type: 'checkbox' on leaves only, groups left as 'label' — leaves get a box, groups get neither", () => {
    const tree = mount();
    const defs: IDef[] = sampleDefs().map((def) => {
      const isLeaf = ['q1', 'q2', 'images', 'archive'].includes(def.id);
      return isLeaf ? { ...def, type: 'checkbox' } : def;
    });
    tree.build(defs, getLabel);

    for (const leafId of ['q1', 'q2', 'images', 'archive']) {
      const node = byId(tree, leafId);
      expect(checkboxSpan(node)).toBeTruthy();
      expect(node.getAttribute('aria-checked')).toBe('false');
    }
    for (const groupId of ['docs', 'reports']) {
      const node = byId(tree, groupId);
      expect(checkboxSpan(node)).toBeNull();
      expect(node.hasAttribute('aria-checked')).toBe(false);
      expect(node.hasAttribute('aria-expanded')).toBe(true); // still expandable
    }
  });

  it('mixed placement — checkbox and label nodes interleaved at any level (including a checkbox group) renders correctly', () => {
    const tree = mount();
    const defs: IDef[] = sampleDefs().map((def) => {
      if (def.id === 'docs') return { ...def, type: 'checkbox' }; // a checkbox GROUP
      if (def.id === 'reports') return def; // a label group, nested under a checkbox group
      if (def.id === 'q1') return { ...def, type: 'checkbox' }; // a checkbox leaf under a label group
      return def; // q2, images, archive stay label
    });
    tree.build(defs, getLabel);

    expect(checkboxSpan(byId(tree, 'docs'))).toBeTruthy();
    expect(checkboxSpan(byId(tree, 'reports'))).toBeNull();
    expect(checkboxSpan(byId(tree, 'q1'))).toBeTruthy();
    expect(checkboxSpan(byId(tree, 'q2'))).toBeNull();
    expect(checkboxSpan(byId(tree, 'images'))).toBeNull();
    expect(checkboxSpan(byId(tree, 'archive'))).toBeNull();
  });
});

describe('CheckboxTreeElement — expanded (per-node initial state)', () => {
  it('expanded: true on a branch builds it already expanded', () => {
    const tree = mount();
    const defs = sampleDefs().map((def) => (def.id === 'docs' ? { ...def, expanded: true } : def));
    tree.build(defs, getLabel);
    expect(byId(tree, 'docs').getAttribute('aria-expanded')).toBe('true');
    expect(byId(tree, 'reports').getAttribute('aria-expanded')).toBe('false'); // omitted — default collapsed
  });

  it('expanded is ignored on a leaf (no aria-expanded either way)', () => {
    const tree = mount();
    const defs = sampleDefs().map((def) => (def.id === 'archive' ? { ...def, expanded: true } : def));
    tree.build(defs, getLabel);
    expect(byId(tree, 'archive').hasAttribute('aria-expanded')).toBe(false);
  });

  it('expanded: true on a deep node is literal, not inherited — it requests its own expansion but a collapsed ancestor still hides it', () => {
    const tree = mount();
    const defs = sampleDefs().map((def) => (def.id === 'reports' ? { ...def, expanded: true } : def));
    tree.build(defs, getLabel);
    expect(byId(tree, 'docs').getAttribute('aria-expanded')).toBe('false'); // ancestor: default collapsed
    expect(byId(tree, 'reports').getAttribute('aria-expanded')).toBe('true'); // its own literal request
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
  it('a checkbox leaf flips aria-checked and emits checkbox-tree:change with the new checkedIds', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const archive = byId(tree, 'archive');
    let detail: { checkedIds: string[]; nodeId: string; checked: boolean } | null = null;
    tree.addEventListener(CheckboxTreeElement.events.change, (ev) => {
      detail = (ev as CustomEvent<typeof detail>).detail;
    });
    archive.focus();
    fireKey(archive, ' ');
    expect(archive.getAttribute('aria-checked')).toBe('true');
    expect(checkboxSpan(archive)!.dataset.state).toBe('checked');
    expect(detail).toEqual({ checkedIds: ['archive'], nodeId: 'archive', checked: true });
  });

  it("a checkbox group in (default) 'cascade' mode cascades to all descendant checkbox-leaves and updates its own aria-checked", () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const reports = byId(tree, 'reports');
    reports.focus();
    fireKey(reports, 'Enter');
    expect(tree.getChecked().sort()).toEqual(['q1', 'q2']);
    expect(reports.getAttribute('aria-checked')).toBe('true');
    expect(byId(tree, 'q1').getAttribute('aria-checked')).toBe('true');
    expect(byId(tree, 'q2').getAttribute('aria-checked')).toBe('true');
  });

  it("cascade aggregation ignores 'label' descendants — a checkbox group with one checkbox-leaf and one label-leaf reads 'checked', not 'mixed', once the checkbox-leaf is checked", () => {
    const tree = mount();
    const defs: IDef[] = sampleDefs().map((def) => {
      if (def.id === 'reports') return { ...def, type: 'checkbox' };
      if (def.id === 'q1') return { ...def, type: 'checkbox' };
      return def; // q2 stays label — irrelevant to aggregation
    });
    tree.build(defs, getLabel);
    const q1 = byId(tree, 'q1');
    q1.focus();
    fireKey(q1, ' ');
    expect(byId(tree, 'reports').getAttribute('aria-checked')).toBe('true');
  });
});

describe('CheckboxTreeElement — Enter/Space on a label node', () => {
  it("a type: 'label' leaf is a no-op; a type: 'label' group expands instead, and neither emits", () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel); // every node defaults to 'label'
    const docs = byId(tree, 'docs');
    const archive = byId(tree, 'archive');
    let fired = false;
    tree.addEventListener(CheckboxTreeElement.events.change, () => { fired = true; });

    archive.focus();
    fireKey(archive, ' ');
    expect(archive.hasAttribute('aria-checked')).toBe(false);

    docs.focus();
    fireKey(docs, ' ');
    expect(docs.expanded).toBe(true);
    expect(fired).toBe(false);
  });
});

describe("CheckboxTreeElement — checkable: 'self'", () => {
  it('toggling a checkbox group flips only its own box — descendants and ancestors are untouched, and mixed never appears', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel, { checkable: 'self' });
    const reports = byId(tree, 'reports');
    reports.focus();
    fireKey(reports, ' ');

    expect(reports.getAttribute('aria-checked')).toBe('true');
    expect(byId(tree, 'q1').getAttribute('aria-checked')).toBe('false');
    expect(byId(tree, 'q2').getAttribute('aria-checked')).toBe('false');
    expect(byId(tree, 'docs').getAttribute('aria-checked')).toBe('false'); // ancestor untouched
    expect(tree.getChecked()).toContain('reports');
  });

  it('checking every descendant checkbox-leaf does not flip an ancestor self-group — no aggregation happens', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel, { checkable: 'self' });
    const q1 = byId(tree, 'q1');
    const q2 = byId(tree, 'q2');
    q1.focus(); fireKey(q1, ' ');
    q2.focus(); fireKey(q2, ' ');
    expect(byId(tree, 'reports').getAttribute('aria-checked')).toBe('false');
    expect(byId(tree, 'docs').getAttribute('aria-checked')).toBe('false');
  });

  it('getChecked includes a checked self-group id; setChecked reflects it without emitting', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel, { checkable: 'self' });
    let fired = false;
    tree.addEventListener(CheckboxTreeElement.events.change, () => { fired = true; });

    tree.setChecked(['reports']);
    expect(byId(tree, 'reports').getAttribute('aria-checked')).toBe('true');
    expect(byId(tree, 'docs').getAttribute('aria-checked')).toBe('false');
    expect(tree.getChecked()).toEqual(['reports']);
    expect(fired).toBe(false);
  });
});

describe('CheckboxTreeElement — click', () => {
  it('clicking the checkbox behaves like Space', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const archive = byId(tree, 'archive');
    checkboxSpan(archive)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(archive.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking the content toggles expand/collapse, not checked', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const docs = byId(tree, 'docs');
    docs.contentEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(docs.expanded).toBe(true);
    expect(docs.getAttribute('aria-checked')).toBe('false');
  });
});

describe('CheckboxTreeElement — tri-state reflection', () => {
  it('checking every child flips the parent (and ancestors) to checked; unchecking one flips it to mixed', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const reports = byId(tree, 'reports');
    const q1 = byId(tree, 'q1');
    const q2 = byId(tree, 'q2');
    const docs = byId(tree, 'docs');

    q1.focus(); fireKey(q1, ' ');
    q2.focus(); fireKey(q2, ' ');
    expect(reports.getAttribute('aria-checked')).toBe('true');
    expect(checkboxSpan(reports)!.dataset.state).toBe('checked');
    expect(docs.getAttribute('aria-checked')).toBe('mixed'); // images still unchecked

    q1.focus(); fireKey(q1, ' '); // uncheck q1
    expect(reports.getAttribute('aria-checked')).toBe('mixed');
    expect(checkboxSpan(reports)!.dataset.state).toBe('mixed');
    expect(docs.getAttribute('aria-checked')).toBe('mixed');
  });
});

describe('CheckboxTreeElement — setChecked / getChecked (uncontrolled contract)', () => {
  it('setChecked reflects checked/mixed visuals and does not emit', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
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
    tree.build(checkableDefs(), getLabel);
    tree.setChecked(['q1', 'archive']);
    expect(tree.getChecked().sort()).toEqual(['archive', 'q1']);
  });
});

describe('CheckboxTreeElement — interactiveSelector guard', () => {
  it('keys are suppressed when focus is inside injected interactive content', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
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
    tree.build(checkableDefs(), getLabel);
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
    tree.build(checkableDefs(), getLabel);
    const reports = byId(tree, 'reports');
    reports.focus();
    fireKey(reports, ' ');
    expect(byId(tree, 'images').getAttribute('aria-checked')).toBe('false');
    expect(byId(tree, 'archive').getAttribute('aria-checked')).toBe('false');
  });
});

describe('CheckboxTreeElement — add', () => {
  it('adding a first child flips a leaf to a branch (toggle appears, aria-expanded=false)', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const images = byId(tree, 'images');
    expect(images.isLeaf).toBe(true);

    tree.add({ id: 'photo1', parent_id: 'images' }, images);
    expect(images.isLeaf).toBe(false);
    expect(images.getAttribute('aria-expanded')).toBe('false');
    expect(byId(tree, 'photo1')).toBeTruthy();
  });

  it("the added node's own type decides its checkbox, independent of its parent's placement", () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel); // every existing node is 'label'
    tree.add({ id: 'photo1', parent_id: 'images', type: 'checkbox' }, 'images');
    const photo1 = byId(tree, 'photo1');
    expect(checkboxSpan(photo1)).toBeTruthy();
    expect(photo1.getAttribute('aria-checked')).toBe('false');
  });

  it('supports a root-level add (parent omitted/null)', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    tree.add({ id: 'trash', parent_id: null });
    const trash = byId(tree, 'trash');
    expect(trash.parentElement).toBe(tree);
    expect(trash.getAttribute('aria-level')).toBe('1');
  });

  it('accepts a string id for the parent argument, in addition to an element', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    tree.add({ id: 'photo1', parent_id: 'images' }, 'images');
    expect(byId(tree, 'photo1')).toBeTruthy();
    expect(byId(tree, 'images').isLeaf).toBe(false);
  });
});

describe('CheckboxTreeElement — add, cascade aggregation', () => {
  it('adding an unchecked checkbox-leaf into a fully-checked group flips that group (and its ancestors) to mixed', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const reports = byId(tree, 'reports');
    const docs = byId(tree, 'docs');
    tree.setChecked(['q1', 'q2', 'images']); // every leaf under docs checked
    expect(docs.getAttribute('aria-checked')).toBe('true');

    tree.add({ id: 'q3', parent_id: 'reports', type: 'checkbox' }, reports);
    expect(reports.getAttribute('aria-checked')).toBe('mixed');
    expect(docs.getAttribute('aria-checked')).toBe('mixed');
  });

  it('adding a type: "label" leaf into a fully-checked cascade group does not affect its aggregate', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const reports = byId(tree, 'reports');
    tree.setChecked(['q1', 'q2', 'images']);

    tree.add({ id: 'q3', parent_id: 'reports' }, reports); // default type: 'label'
    expect(reports.getAttribute('aria-checked')).toBe('true');
  });
});

describe('CheckboxTreeElement — leaf ↔ branch checkbox storage transition', () => {
  it("cascade: a checked checkbox-leaf gaining a child forgets its stored state and begins deriving (empty group → unchecked)", () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const images = byId(tree, 'images');
    images.focus();
    fireKey(images, ' '); // check the leaf directly
    expect(images.getAttribute('aria-checked')).toBe('true');

    tree.add({ id: 'photo1', parent_id: 'images' }, images); // becomes a branch; no longer stored
    expect(tree.getChecked()).not.toContain('images');
    expect(images.getAttribute('aria-checked')).toBe('false'); // derives — no checked descendants yet
  });

  it('self: a checked checkbox-leaf gaining a child keeps its stored box state', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel, { checkable: 'self' });
    const images = byId(tree, 'images');
    images.focus();
    fireKey(images, ' ');
    expect(images.getAttribute('aria-checked')).toBe('true');

    tree.add({ id: 'photo1', parent_id: 'images' }, images);
    expect(tree.getChecked()).toContain('images');
    expect(images.getAttribute('aria-checked')).toBe('true'); // kept, not forgotten
  });
});

describe('CheckboxTreeElement — removeNode', () => {
  it('removing the last child flips a branch back to a leaf', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const reports = byId(tree, 'reports');
    tree.removeNode('q1');
    expect(reports.isLeaf).toBe(false);
    tree.removeNode('q2');
    expect(reports.isLeaf).toBe(true);
    expect(reports.hasAttribute('aria-expanded')).toBe(false);
  });

  it('removing an unchecked leaf from a mixed group can flip it to checked', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    tree.setChecked(['q1']); // reports is mixed (q2 unchecked)
    const reports = byId(tree, 'reports');
    expect(reports.getAttribute('aria-checked')).toBe('mixed');

    tree.removeNode('q2');
    expect(reports.getAttribute('aria-checked')).toBe('true');
  });

  it('drops the removed leaves from getChecked, whether removed directly or as part of a subtree', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    tree.setChecked(['q1', 'q2', 'archive']);

    tree.removeNode('reports'); // removes the q1/q2 subtree
    expect(tree.getChecked()).toEqual(['archive']);

    tree.removeNode('archive'); // removes a checked leaf directly
    expect(tree.getChecked()).toEqual([]);
  });
});

describe('CheckboxTreeElement — removeNode, self mode', () => {
  it("forgets a removed checkbox-group's own stored id (not just checkbox-leaves), and never reflects ancestors", () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel, { checkable: 'self' });
    const reports = byId(tree, 'reports');
    const docs = byId(tree, 'docs');
    reports.focus();
    fireKey(reports, ' '); // check the group's own box
    tree.setChecked([...tree.getChecked(), 'q1']); // also check a descendant leaf, independently
    expect(tree.getChecked().sort()).toEqual(['q1', 'reports']);

    tree.removeNode('reports');
    expect(tree.getChecked()).toEqual([]);
    expect(docs.getAttribute('aria-checked')).toBe('false'); // untouched — never a self ancestor recompute
  });
});

describe('CheckboxTreeElement — move', () => {
  it("re-parents a node, correcting aria-level/aria-posinset — including a moved subtree's descendants", () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const reports = byId(tree, 'reports'); // level 2, under docs

    tree.move('reports', null);

    expect(reports.parentElement).toBe(tree);
    expect(reports.getAttribute('aria-level')).toBe('1');
    expect(reports.getAttribute('aria-setsize')).toBe('3');
    expect(reports.getAttribute('aria-posinset')).toBe('3');
    expect(byId(tree, 'q1').getAttribute('aria-level')).toBe('2');
    expect(byId(tree, 'q2').getAttribute('aria-level')).toBe('2');
  });

  it('keeps its checked leaves after a move', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    tree.setChecked(['q1']);
    tree.move('reports', null);
    expect(tree.getChecked()).toEqual(['q1']);
    expect(byId(tree, 'q1').getAttribute('aria-checked')).toBe('true');
  });

  it("updates both the old and new parents' group states", () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    tree.setChecked(['q1', 'q2']); // reports fully checked; docs mixed (images unchecked)
    const docs = byId(tree, 'docs');
    expect(docs.getAttribute('aria-checked')).toBe('mixed');

    tree.move('reports', null);
    expect(docs.getAttribute('aria-checked')).toBe('false'); // only images (unchecked) remains under docs
    expect(docs.isLeaf).toBe(false); // images still there
  });
});

describe('CheckboxTreeElement — move, self mode', () => {
  it("moving a checked checkbox-group keeps its own box; neither the old nor the new parent's ancestors are recomputed", () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel, { checkable: 'self' });
    const reports = byId(tree, 'reports');
    const docs = byId(tree, 'docs');
    reports.focus();
    fireKey(reports, ' ');

    tree.move('reports', null);
    expect(byId(tree, 'reports').getAttribute('aria-checked')).toBe('true'); // kept
    expect(docs.getAttribute('aria-checked')).toBe('false'); // never recomputed either way
  });
});

describe('CheckboxTreeElement — move edge cases', () => {
  it('a cycle-forming move throws and leaves the DOM unchanged', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs');
    const reports = byId(tree, 'reports');
    const docsParentBefore = docs.parentElement;

    expect(() => tree.move(docs, reports)).toThrow(/cannot move a node into its own subtree/);
    expect(docs.parentElement).toBe(docsParentBefore);
    expect(byId(tree, 'reports')).toBe(reports);
  });

  it('supports a root-level move (newParent omitted/null) and resolves a string-id argument', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    tree.move('images', null);
    const images = byId(tree, 'images');
    expect(images.parentElement).toBe(tree);
    expect(images.getAttribute('aria-level')).toBe('1');
  });

  it('removeNode/move of the tab-holding node reassigns tabindex=0', () => {
    const tree = mount();
    tree.build(sampleDefs(), getLabel);
    const docs = byId(tree, 'docs'); // first root — the initial tab stop
    expect(docs.tabIndex).toBe(0);

    tree.removeNode('docs');
    const tabbable = allNodes(tree).filter((n) => n.tabIndex === 0);
    expect(tabbable).toEqual([byId(tree, 'archive')]);
  });

  it('mutation is surgical — nodes outside the affected region keep their identity and state', () => {
    const tree = mount();
    tree.build(checkableDefs(), getLabel);
    const archive = byId(tree, 'archive');
    const archiveCheckbox = checkboxSpan(archive);

    tree.add({ id: 'photo1', parent_id: 'images' }, 'images');

    expect(byId(tree, 'archive')).toBe(archive);
    expect(checkboxSpan(archive)).toBe(archiveCheckbox);
    expect(archive.getAttribute('aria-checked')).toBe('false');
  });
});
