import './tree.css';
import { treeCss } from './tree-dom.ts';
import { TreeNodeElement, createTreeNode } from './tree-node.ts';
import { CheckboxModel } from './tri-state.ts';

/** Minimal shape of a build definition: a stable `id` and its `parent_id` (`null` for a root). */
interface ITreeDef {
  id: string;
  parent_id: string | null;
}

/** Whether every row gets a checkbox (`'all'`, tri-state) or only leaves do (`'leaves'`, no cascade). */
type Checkable = 'all' | 'leaves';

/** Options for {@link CheckboxTreeElement.build}. */
interface IBuildOptions {
  checkable?: Checkable;
}

/**
 * `<checkbox-tree>` — a labeled `role="tree"` composed from a flat array of defs, rendering an
 * accessible checkbox per {@link Checkable} mode. This task builds the **static** structure only:
 * roles, positional ARIA, a single tab stop, and checkbox rendering. No keyboard, no toggling.
 *
 * **Eager build.** Every node is materialized up front, roots down; branches start collapsed —
 * their subtree stays in the DOM (CSS hides it), never rebuilt on expand. See the checkbox-tree
 * build plan's Design decisions §4.
 */
class CheckboxTreeElement extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'checkbox-tree';

  /** Default accessible name, applied only when the consumer supplied neither `aria-label` nor `aria-labelledby`. */
  static readonly defaultLabel = 'Tree';

  #getLabel: ((def: ITreeDef) => string) | null = null;
  #checkable: Checkable = 'all';
  #model = new CheckboxModel();

  /** Establishes tree semantics and the accessible name. */
  connectedCallback(): void {
    this.setAttribute('role', 'tree');
    this.#applyAccessibleName();
  }

  /**
   * Builds the tree from a flat `defs` array. Clears any previous content. `getLabel` is called
   * once per node, at creation, to produce its row's label text.
   * @param defs - Flat node definitions; a node is a branch iff some other def names it as `parent_id`.
   * @param getLabel - Produces each row's label text from its definition.
   * @param options.checkable - `'all'` (default) renders a checkbox on every row; `'leaves'` only on leaves.
   */
  build<T extends ITreeDef>(defs: T[], getLabel: (def: T) => string, options: IBuildOptions = {}): void {
    this.#getLabel = getLabel as (def: ITreeDef) => string;
    this.#checkable = options.checkable ?? 'all';
    this.#model = new CheckboxModel();
    this.replaceChildren();

    const childrenByParent = new Map<string, T[]>();
    const roots: T[] = [];
    for (const def of defs) {
      if (def.parent_id === null) { roots.push(def); continue; }
      const siblings = childrenByParent.get(def.parent_id);
      if (siblings) siblings.push(def);
      else childrenByParent.set(def.parent_id, [def]);
    }

    const buildNode = (def: T, level: number, setsize: number, posinset: number): TreeNodeElement => {
      const node = createTreeNode(this.#getLabel!(def));
      node.dataset.id = def.id;
      if (def.parent_id !== null) node.dataset.parentId = def.parent_id;
      node.setAttribute('aria-level', String(level));
      node.setAttribute('aria-setsize', String(setsize));
      node.setAttribute('aria-posinset', String(posinset));

      const childDefs = childrenByParent.get(def.id);
      node.setLeaf(!childDefs);
      if (childDefs) {
        childDefs.forEach((childDef, i) => {
          node.appendChildNode(buildNode(childDef, level + 1, childDefs.length, i + 1));
        });
      }

      const wantsCheckbox = this.#checkable === 'all' || !childDefs;
      if (wantsCheckbox) this.#addCheckbox(node);
      return node;
    };

    roots.forEach((def, i) => this.appendChild(buildNode(def, 1, roots.length, i + 1)));

    const first = this.querySelector<TreeNodeElement>(TreeNodeElement.tagName);
    if (first) first.tabIndex = 0;
  }

  /** Expands every rendered branch. */
  expandAll(): void {
    for (const node of this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      if (!node.isLeaf) node.expand();
    }
  }

  /** Collapses every rendered branch. */
  collapseAll(): void {
    for (const node of this.querySelectorAll<TreeNodeElement>(TreeNodeElement.tagName)) {
      if (!node.isLeaf) node.collapse();
    }
  }

  /** Applies the accessible name, forwarding a consumer-supplied `aria-label`/`aria-labelledby`, else defaulting. */
  #applyAccessibleName(): void {
    if (this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby')) return;
    this.setAttribute('aria-label', CheckboxTreeElement.defaultLabel);
  }

  /**
   * Inserts the decorative, `aria-hidden` checkbox visual into `node`'s row (after the toggle,
   * before the content) and sets the row's initial `aria-checked="false"`. Called only when the
   * mode calls for a checkbox on this node — a `'leaves'`-mode group gets neither.
   */
  #addCheckbox(node: TreeNodeElement): void {
    const span = document.createElement('span');
    span.className = treeCss.checkbox;
    span.setAttribute('aria-hidden', 'true');
    span.dataset.state = 'unchecked';
    node.rowEl.insertBefore(span, node.contentEl);
    node.setAttribute('aria-checked', 'false');
  }
}

if (!customElements.get(CheckboxTreeElement.tagName)) {
  customElements.define(CheckboxTreeElement.tagName, CheckboxTreeElement);
}

export { CheckboxTreeElement };
export type { ITreeDef, Checkable, IBuildOptions };
