import "ol/ol.css";
import "./app.css";
import { createMapController } from "./map/controller.ts";
import { loadLayerConfigs } from "./config/index.ts";
import { createSingleStores } from "./state/stores.single.ts";

const configs = loadLayerConfigs();
const stores = createSingleStores(configs);
const controller = createMapController("map", configs, stores);

const panel = document.querySelector<HTMLDivElement>("#panel");
if (panel) {
  panel.innerHTML = "<h1>app-demo-stores — single store</h1>";
}

// Dev-only console access for manual verification (Task 13: toggle visibility from the console).
if (import.meta.env.DEV) {
  Object.assign(window, { stores, controller });
}
