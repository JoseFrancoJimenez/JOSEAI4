import "./toc.css";
import { CheckboxTreeElement } from "@mini/lib/widgets";
import type { ICheckboxTreeChangeDetail, ICheckboxTreeNodeDef } from "@mini/lib/widgets";
import type { Subscription } from "@mini/lib/core";
import type { AppStores } from "../../state/facade.ts";
import type { LayerConfig } from "../../config/types.ts";
import { getLayerConfig } from "../../config/index.ts";
import { buildTreeDefs, slugify } from "../../state/tree-defs.ts";

const GROUP_PREFIX = "group:";

// checkbox-tree's own `TreeNodeElement` fires this after every expand/collapse (bubbling), but
// the class itself isn't part of the lib's public `@mini/lib/widgets` surface — only its string
// value is needed here, so it's pinned as a literal rather than importing the internal class.
// See src/lib/widgets/checkbox-tree/tree-node.ts — `TreeNodeElement.events.toggle`.
const NODE_TOGGLE_EVENT = "tree-node:toggle";

interface NodeToggleDetail {
  expanded: boolean;
}

/** Order-independent content comparison — the echo guard for expansion writes: a freshly built
 * array never matches by reference, so `Object.is` alone can't stop a write loop. */
function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * `<app-toc>` — wraps `<checkbox-tree>` with the layer-config-derived groups from
 * `buildTreeDefs`. The tree is built exactly once, in `connectedCallback`, from the store's
 * `expandedIds` at that moment — the widget has no public `setExpanded`, so this is the only
 * point restored/initial expansion can be applied. On a later reconnect (e.g. a DOM move), the
 * same path rebuilds from whatever `expandedIds` holds by then, so expansion survives it.
 *
 * store -> tree (visibility): `setChecked` reflects without emitting — a dead end, no guard
 * needed. tree -> store (visibility): the change event's full checked set is written through
 * exactly one `setVisibleMany` batch, never one `set` per layer. tree -> store (expansion): the
 * wrapper accumulates the expanded group-id set itself from the tree's per-node toggle events
 * (the widget exposes no `getExpanded`) and writes only on a genuine content change.
 */
class TocElement extends HTMLElement {
  static readonly tagName = "app-toc";

  #stores: AppStores | null = null;
  #configs: LayerConfig[] = [];
  #tree: CheckboxTreeElement | null = null;
  #visibilitySubscription: Subscription | null = null;
  #expandedIds = new Set<string>();

  setup(stores: AppStores, configs: LayerConfig[]): void {
    this.#stores = stores;
    this.#configs = configs;
  }

  connectedCallback(): void {
    const stores = this.#stores;
    if (!stores) return;
    this.#buildTree(stores);
    this.addEventListener(CheckboxTreeElement.events.change, this.#onTreeChange);
    this.addEventListener(NODE_TOGGLE_EVENT, this.#onNodeToggle);
    this.#visibilitySubscription = stores.layers.subscribe("layersById", () => this.#reflectChecked(), {
      immediate: true,
    });
  }

  disconnectedCallback(): void {
    this.#visibilitySubscription?.remove();
    this.#visibilitySubscription = null;
    this.removeEventListener(CheckboxTreeElement.events.change, this.#onTreeChange);
    this.removeEventListener(NODE_TOGGLE_EVENT, this.#onNodeToggle);
  }

  #buildTree(stores: AppStores): void {
    this.replaceChildren();
    const tree = document.createElement(CheckboxTreeElement.tagName) as CheckboxTreeElement;
    this.appendChild(tree);
    this.#tree = tree;

    const defs = buildTreeDefs(this.#configs, { expandedIds: stores.ui.get("expandedIds") });
    tree.build(defs, (def) => this.#labelFor(def), { checkable: "cascade" });
    // Seed from the defs actually stamped `expanded: true` — buildTreeDefs already filtered the
    // store's raw expandedIds down to groups that exist in this build, so a stale id from a
    // since-changed config never lingers in the accumulated set.
    this.#expandedIds = new Set(defs.filter((d) => d.expanded === true).map((d) => d.id));
  }

  #labelFor(def: ICheckboxTreeNodeDef): string {
    if (def.id.startsWith(GROUP_PREFIX)) return this.#categoryLabel(def.id) ?? def.id;
    return getLayerConfig(this.#configs, def.id)?.label ?? def.id;
  }

  #categoryLabel(groupId: string): string | undefined {
    return this.#configs.find(
      (c) => c.category !== undefined && `${GROUP_PREFIX}${slugify(c.category)}` === groupId,
    )?.category;
  }

  #reflectChecked(): void {
    const stores = this.#stores;
    if (!stores || !this.#tree) return;
    const layersById = stores.layers.get("layersById");
    const visibleIds = this.#configs.filter((c) => layersById[c.id]?.visible === true).map((c) => c.id);
    this.#tree.setChecked(visibleIds);
  }

  #onTreeChange = (ev: Event): void => {
    const stores = this.#stores;
    if (!stores) return;
    const { checkedIds } = (ev as CustomEvent<ICheckboxTreeChangeDetail>).detail;
    const checkedSet = new Set(checkedIds);
    const allIds = this.#configs.map((c) => c.id);
    const toShow = allIds.filter((id) => checkedSet.has(id));
    const toHide = allIds.filter((id) => !checkedSet.has(id));

    stores.layers.batch(() => {
      stores.layers.setVisibleMany(toShow, true);
      stores.layers.setVisibleMany(toHide, false);
    });
  };

  #onNodeToggle = (ev: Event): void => {
    const stores = this.#stores;
    if (!stores) return;
    const target = ev.target as HTMLElement;
    const id = target.dataset.id;
    if (!id) return;
    const { expanded } = (ev as CustomEvent<NodeToggleDetail>).detail;

    if (expanded) this.#expandedIds.add(id);
    else this.#expandedIds.delete(id);

    const next = [...this.#expandedIds];
    if (sameIdSet(stores.ui.get("expandedIds"), next)) return;
    stores.ui.setExpanded(next);
  };
}

if (!customElements.get(TocElement.tagName)) {
  customElements.define(TocElement.tagName, TocElement);
}

export { TocElement };
