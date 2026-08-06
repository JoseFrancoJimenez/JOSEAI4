import "ol/ol.css";
import "./app.css";
import { composeApp } from "./composeApp.ts";
import { createDomainStores } from "./state/stores.domain.ts";

const panel = document.querySelector<HTMLDivElement>("#panel");
if (panel) {
  const heading = document.createElement("h1");
  heading.textContent = "app-demo-stores — domain stores";
  panel.appendChild(heading);
}

const { stores, controller } = composeApp("map", panel ?? document.body, createDomainStores);

// Dev-only console access for manual verification.
if (import.meta.env.DEV) {
  Object.assign(window, { stores, controller });
}
