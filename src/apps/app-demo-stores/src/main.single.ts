import "ol/ol.css";
import "./app.css";
import { composeApp } from "./composeApp.ts";
import { createSingleStores } from "./state/stores.single.ts";

const panel = document.querySelector<HTMLDivElement>("#panel");
if (panel) {
  const heading = document.createElement("h1");
  heading.textContent = "app-demo-stores — single store";
  panel.appendChild(heading);
}

const { stores, controller } = composeApp("map", panel ?? document.body, createSingleStores);

// Dev-only console access for manual verification.
if (import.meta.env.DEV) {
  Object.assign(window, { stores, controller });
}
