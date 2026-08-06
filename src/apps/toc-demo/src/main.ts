import { TocModel, CheckboxTreeElement, type ICheckboxTreeChangeDetail } from "@mini/lib/widgets";
import { people } from "./people.ts";
import { familyDefs, allCheckable, leavesCheckable } from "./checkbox-people.ts";
import { LitCheckboxTree } from "./lit-checkbox-tree/lit-checkbox-tree.ts";
import "./webawesome-trees.ts";

const model = new TocModel(people());

/** Mounts a `<checkbox-tree>` into `containerId` and builds it from `defs`. */
function mountCheckboxTree(
  containerId: string,
  label: string,
  defs: ReturnType<typeof allCheckable>,
  checkable: "cascade" | "self",
): void {
  const tree = document.createElement(CheckboxTreeElement.tagName) as CheckboxTreeElement;
  tree.setAttribute("aria-label", label);
  document.getElementById(containerId)!.appendChild(tree);
  tree.build(defs, (def) => def.id, { checkable });

  tree.addEventListener(CheckboxTreeElement.events.change, (event) => {
    const detail = (event as CustomEvent).detail as ICheckboxTreeChangeDetail;
    console.log("checkbox-tree change", { label, ...detail });
  });
}

/** Mounts a `<lit-checkbox-tree>` into `containerId` and builds it from `defs` — the Lit counterpart of {@link mountCheckboxTree}. */
function mountLitCheckboxTree(
  containerId: string,
  label: string,
  defs: ReturnType<typeof allCheckable>,
  checkable: "cascade" | "self",
): void {
  const tree = document.createElement(LitCheckboxTree.tagName) as LitCheckboxTree;
  tree.setAttribute("aria-label", label);
  document.getElementById(containerId)!.appendChild(tree);
  tree.build(defs, (def) => def.id, { checkable });

  tree.addEventListener(LitCheckboxTree.events.change, (event) => {
    const detail = (event as CustomEvent).detail as ICheckboxTreeChangeDetail;
    console.log("lit-checkbox-tree change", { label, ...detail });
  });
}

mountCheckboxTree("checkbox-tree-cascade-all", "People (cascade, every node checkable)", allCheckable(familyDefs()), "cascade");
mountCheckboxTree("checkbox-tree-cascade-leaves", "People (cascade, leaves only checkable)", leavesCheckable(familyDefs()), "cascade");
mountCheckboxTree("checkbox-tree-self-all", "People (self, every node checkable)", allCheckable(familyDefs()), "self");
mountCheckboxTree("checkbox-tree-self-leaves", "People (self, leaves only checkable)", leavesCheckable(familyDefs()), "self");

mountLitCheckboxTree("lit-checkbox-tree-cascade-all", "People (cascade, every node checkable)", allCheckable(familyDefs()), "cascade");
mountLitCheckboxTree("lit-checkbox-tree-cascade-leaves", "People (cascade, leaves only checkable)", leavesCheckable(familyDefs()), "cascade");
mountLitCheckboxTree("lit-checkbox-tree-self-all", "People (self, every node checkable)", allCheckable(familyDefs()), "self");
mountLitCheckboxTree("lit-checkbox-tree-self-leaves", "People (self, leaves only checkable)", leavesCheckable(familyDefs()), "self");

console.log("toc-demo booted", { nodes: model.size });
