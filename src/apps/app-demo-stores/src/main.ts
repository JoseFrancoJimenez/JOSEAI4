import "ol/ol.css";
import "./app.css";
import { createMapController } from "./map/controller.ts";

createMapController("map");

const panel = document.querySelector<HTMLDivElement>("#panel");
if (panel) {
  panel.innerHTML = "<h1>app-demo-stores — domain stores</h1>";
}
