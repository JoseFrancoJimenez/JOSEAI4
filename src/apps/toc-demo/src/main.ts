import { TocComponent, TocModel } from "@mini/lib/widgets";
import { people } from "./people.ts";

const model = new TocModel(people());

const host = document.createElement(TocComponent.tagName) as TocComponent;
document.getElementById("toc")!.appendChild(host);
host.setup(model);
host.expandAll();

console.log("toc-demo booted", { nodes: model.size });
