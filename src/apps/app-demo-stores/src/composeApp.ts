import { loadLayerConfigs } from "./config/index.ts";
import type { LayerConfig } from "./config/types.ts";
import { decodeShareState } from "./share/url.ts";
import { buildRestoredState } from "./state/restore.ts";
import type { AppState } from "./state/keys.ts";
import type { AppStores } from "./state/facade.ts";
import { createMapController, type MapController } from "./map/controller.ts";

import "./widgets/toc/toc.ts";
import "./widgets/toggle-buttons/toggle-buttons.ts";
import "./widgets/layers-summary/layers-summary.ts";
import "./widgets/legend/legend.ts";
import "./widgets/variable-switcher/variable-switcher.ts";
import "./widgets/table/table.ts";
import "./widgets/share-app/share-app.ts";

/** Every widget's custom element tag, in mount order. Each takes `setup(stores, configs)` (some
 * ignore `configs`) — see the Settled decisions in docs/tasks/store-tasks.md. */
const WIDGET_TAGS = [
  "app-toc",
  "app-toggle-buttons",
  "app-layers-summary",
  "app-legend",
  "app-variable-switcher",
  "app-table",
  "app-share-app",
] as const;

export type CreateStores = (configs: LayerConfig[], initial?: Partial<AppState>) => AppStores;

export interface ComposedApp {
  configs: LayerConfig[];
  stores: AppStores;
  controller: MapController;
}

/**
 * Resolves the initial store state for this load: config-seeded defaults, overridden per-layer
 * by whatever the current URL's share link decodes to (empty when there is none). Pure — no DOM,
 * no store — so both roots' restoration behavior is directly testable without booting the map.
 */
export function resolveInitialState(configs: LayerConfig[], search: string): Partial<AppState> {
  return buildRestoredState(configs, decodeShareState(search, configs));
}

/**
 * The shared composition root both entry points call — they differ **only** in which store
 * factory they pass in. Order matters: decode and restore happen *before* any store exists, so
 * there are no subscribers yet to coalesce a cross-store batch for — restoring before wiring is
 * what makes the missing `batchAcross` a non-issue (see docs/tasks/store-tasks.md, Task 26 and
 * the Out-of-scope list). The map instance is owned solely by the returned controller and never
 * enters any store.
 */
export function composeApp(mapTarget: string | HTMLElement, panel: HTMLElement, createStores: CreateStores): ComposedApp {
  const configs = loadLayerConfigs();
  const initial = resolveInitialState(configs, location.search);
  const stores = createStores(configs, initial);
  const controller = createMapController(mapTarget, configs, stores);

  mountWidgets(panel, stores, configs);

  return { configs, stores, controller };
}

function mountWidgets(panel: HTMLElement, stores: AppStores, configs: LayerConfig[]): void {
  for (const tag of WIDGET_TAGS) {
    const el = document.createElement(tag) as HTMLElement & { setup: (s: AppStores, c: LayerConfig[]) => void };
    el.setup(stores, configs);
    panel.appendChild(el);
  }
}
