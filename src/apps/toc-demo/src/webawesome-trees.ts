import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "@awesome.me/webawesome/dist/components/tree/tree.js";
import "@awesome.me/webawesome/dist/components/tree-item/tree-item.js";
import type {} from "@awesome.me/webawesome/dist/events/selection-change.js";
import { familyDefs } from "./checkbox-people.ts";

interface IPersonDef {
  id: string;
  parent_id: string | null;
  expanded?: boolean;
}

/** Groups `defs` by `parent_id` — the shape {@link buildTreeItem} walks to nest children. */
function groupByParent(defs: IPersonDef[]): Map<string, IPersonDef[]> {
  const byParent = new Map<string, IPersonDef[]>();
  for (const def of defs) {
    if (def.parent_id === null) continue;
    const siblings = byParent.get(def.parent_id);
    if (siblings) siblings.push(def);
    else byParent.set(def.parent_id, [def]);
  }
  return byParent;
}

/**
 * Builds a `<wa-tree-item>` for `def`: its id (for event lookups), label text, initial expand state,
 * and nested child `<wa-tree-item>`s in the same default slot as the label — how Web Awesome expects
 * a tree's markup to be composed.
 */
function buildTreeItem(def: IPersonDef, byParent: Map<string, IPersonDef[]>): HTMLElement {
  const item = document.createElement("wa-tree-item");
  item.dataset.id = def.id;
  item.expanded = def.expanded === true;
  item.append(def.id);
  for (const child of byParent.get(def.id) ?? []) item.append(buildTreeItem(child, byParent));
  return item;
}

/** Mounts a `<wa-tree>` into `containerId`, built from `defs`, in the given selection mode. */
function mountWebAwesomeTree(
  containerId: string,
  label: string,
  defs: IPersonDef[],
  selection: "single" | "multiple",
): void {
  const tree = document.createElement("wa-tree");
  tree.setAttribute("aria-label", label);
  tree.selection = selection;

  const byParent = groupByParent(defs);
  for (const def of defs.filter((d) => d.parent_id === null)) tree.append(buildTreeItem(def, byParent));

  document.getElementById(containerId)!.appendChild(tree);

  tree.addEventListener("wa-selection-change", (event) => {
    const { selection: selectedItems } = event.detail;
    console.log("wa-tree selection-change", { label, ids: selectedItems.map((item) => item.dataset.id) });
  });
}

mountWebAwesomeTree("wa-tree-plain", "People (Web Awesome, single selection)", familyDefs(), "single");
mountWebAwesomeTree("wa-tree-checkbox", "People (Web Awesome, multiple selection / checkboxes)", familyDefs(), "multiple");
