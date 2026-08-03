import { TocModel, CheckboxTreeElement } from "@mini/lib/widgets";
import { people } from "./people.ts";
import { familyDefs, allCheckable, leavesCheckable } from "./checkbox-people.ts";

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
}

mountCheckboxTree("checkbox-tree-cascade-all", "People (cascade, every node checkable)", allCheckable(familyDefs()), "cascade");
mountCheckboxTree("checkbox-tree-cascade-leaves", "People (cascade, leaves only checkable)", leavesCheckable(familyDefs()), "cascade");
mountCheckboxTree("checkbox-tree-self-all", "People (self, every node checkable)", allCheckable(familyDefs()), "self");
mountCheckboxTree("checkbox-tree-self-leaves", "People (self, leaves only checkable)", leavesCheckable(familyDefs()), "self");

console.log("toc-demo booted", { nodes: model.size });
