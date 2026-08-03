import { TocComponent, TocModel, TreeViewElement } from "@mini/lib/widgets";
import type { ITreeNodeDef } from "@mini/lib/widgets";
import { people } from "./people.ts";

const model = new TocModel(people());

const host = document.createElement(TocComponent.tagName) as TocComponent;
document.getElementById("toc")!.appendChild(host);
host.setup(model);
host.expandAll();

/** Plain label content — the minimal `renderNode`. */
function renderLabel(def: ITreeNodeDef): HTMLElement {
  const span = document.createElement("span");
  span.textContent = def.id;
  return span;
}

/**
 * Label + checkbox content, wrapped in a `<label>` so the checkbox is properly associated.
 * Demonstrates `interactiveSelector`: clicking the checkbox (or its label) never toggles the
 * row — only the toggle arrow does — while the row remains keyboard-operable as a tree item.
 */
function renderCheckbox(def: ITreeNodeDef): HTMLElement {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const text = document.createElement("span");
  text.textContent = def.id;
  label.append(checkbox, text);
  return label;
}

const treeLabels = document.createElement(TreeViewElement.tagName) as TreeViewElement;
treeLabels.setAttribute("aria-label", "People (labels)");
document.getElementById("tree-labels")!.appendChild(treeLabels);
treeLabels.build(people(), renderLabel);
treeLabels.expandAll();

const treeCheckboxes = document.createElement(TreeViewElement.tagName) as TreeViewElement;
treeCheckboxes.setAttribute("aria-label", "People (checkboxes)");
document.getElementById("tree-checkboxes")!.appendChild(treeCheckboxes);
treeCheckboxes.build(people(), renderCheckbox);
treeCheckboxes.expandAll();

console.log("toc-demo booted", { nodes: model.size });
