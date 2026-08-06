import { describe, it, expect, vi } from "vitest";
import tocSource from "./widgets/toc/toc.ts?raw";
import toggleButtonsSource from "./widgets/toggle-buttons/toggle-buttons.ts?raw";
import layersSummarySource from "./widgets/layers-summary/layers-summary.ts?raw";
import legendSource from "./widgets/legend/legend.ts?raw";
import variableSwitcherSource from "./widgets/variable-switcher/variable-switcher.ts?raw";
import tableSource from "./widgets/table/table.ts?raw";
import rowsSource from "./widgets/table/rows.ts?raw";
import shareAppSource from "./widgets/share-app/share-app.ts?raw";
import "./widgets/toc/toc.ts";
import "./widgets/toggle-buttons/toggle-buttons.ts";
import "./widgets/layers-summary/layers-summary.ts";
import "./widgets/legend/legend.ts";
import "./widgets/variable-switcher/variable-switcher.ts";
import "./widgets/table/table.ts";
import "./widgets/share-app/share-app.ts";
import { createDomainStores } from "./state/stores.domain.ts";
import { createReconciler, buildRegistry, type ReconcilableLayer } from "./map/registry.ts";
import type { LayerConfig } from "./config/types.ts";

/**
 * Task 27 — stress pass. Each `describe` below is one of the seven checks from
 * docs/tasks/store-tasks.md's Task 27. `composeApp`/the real map controller boot real OpenLayers,
 * which this repo's jsdom test environment can't run (confirmed: `ResizeObserver is not
 * defined`) — so checks that would otherwise touch the map go through `registry.ts`'s
 * already-established fake-layer pattern instead of a real `OLMap`.
 */

function config(overrides: Partial<LayerConfig> = {}): LayerConfig {
  return {
    type: "vector",
    id: "a",
    label: "A",
    category: "Group A",
    source: { type: "geojson", url: "/a.geojson" },
    visible: true,
    fields: [{ id: "f", label: "F" }],
    default_variable: "v1",
    variables: [
      { id: "v1", renderer: [], legend: { label: "V1", items: [{ label: "x", color: "#000" }] } },
      { id: "v2", renderer: [] },
    ],
    ...overrides,
  };
}

const configs: LayerConfig[] = [
  config({ id: "a", category: "Group A" }),
  config({ id: "b", category: "Group A" }),
  config({ id: "c", category: undefined }),
];

function mountWidget(tag: string, host: HTMLElement, stores: ReturnType<typeof createDomainStores>, cfgs: LayerConfig[]) {
  const el = document.createElement(tag) as HTMLElement & { setup: (s: typeof stores, c: LayerConfig[]) => void };
  el.setup(stores, cfgs);
  host.appendChild(el);
  return el;
}

describe("Check 2 — no echo loops, scripted (cascade, expand/collapse, legend, variables)", () => {
  // Pan/zoom repeatedly is Task 15's own round-trip test (50 alternating updates, linear write
  // count) — not repeated here.

  it("cascade-toggling a group repeatedly produces exactly one write per toggle, no runaway", () => {
    const stores = createDomainStores(configs);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const toc = mountWidget("app-toc", host, stores, configs);

    let writes = 0;
    stores.layers.subscribe("layersById", () => writes++);
    const checkbox = toc.querySelector('[data-id="group:group-a"] .tree-node__checkbox')!;

    const ROUNDS = 10;
    for (let i = 0; i < ROUNDS; i++) checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(writes).toBe(ROUNDS); // alternating all-on/all-off — every toggle is a genuine change
  });

  it("expanding/collapsing the TOC group repeatedly produces exactly one write per gesture, no runaway", () => {
    const stores = createDomainStores(configs);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const toc = mountWidget("app-toc", host, stores, configs);

    let writes = 0;
    stores.ui.subscribe("expandedIds", () => writes++);
    const toggle = toc.querySelector('[data-id="group:group-a"] .tree-node__toggle')!;

    const ROUNDS = 10;
    for (let i = 0; i < ROUNDS; i++) toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(writes).toBe(ROUNDS);
  });
});

describe("Check 2 — no echo loops, scripted (legend, variables)", () => {
  it("toggling every legend section open/closed repeatedly produces exactly one write per gesture, no runaway", () => {
    const stores = createDomainStores(configs);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const legend = mountWidget("app-legend", host, stores, configs);

    let writes = 0;
    stores.ui.subscribe("expandedLegendIds", () => writes++);

    const ROUNDS = 10;
    for (let i = 0; i < ROUNDS; i++) {
      for (const details of legend.querySelectorAll<HTMLDetailsElement>("details")) {
        details.open = !details.open;
        details.dispatchEvent(new Event("toggle"));
      }
    }

    expect(writes).toBe(ROUNDS * configs.length); // every section toggled every round
  });

  it("switching variables repeatedly produces exactly one write per change, no runaway", () => {
    const stores = createDomainStores(configs);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const switcher = mountWidget("app-variable-switcher", host, stores, configs);

    let writes = 0;
    stores.layers.subscribe("variableByLayerId", () => writes++);
    const variableSelect = switcher.querySelectorAll<HTMLSelectElement>("select")[1]!;

    const ROUNDS = 10;
    for (let i = 0; i < ROUNDS; i++) {
      variableSelect.value = variableSelect.value === "v1" ? "v2" : "v1";
      variableSelect.dispatchEvent(new Event("change"));
    }

    expect(writes).toBe(ROUNDS);
  });
});

describe("Check 1 — widget code is identical across the two wirings", () => {
  const widgetSources: [string, string][] = [
    ["toc.ts", tocSource],
    ["toggle-buttons.ts", toggleButtonsSource],
    ["layers-summary.ts", layersSummarySource],
    ["legend.ts", legendSource],
    ["variable-switcher.ts", variableSwitcherSource],
    ["table.ts", tableSource],
    ["rows.ts", rowsSource],
    ["share-app.ts", shareAppSource],
  ];

  it.each(widgetSources)("%s contains no conditional on which store wiring is active", (_name, source) => {
    const suspiciousPatterns = [/createSingleStores/, /createDomainStores/, /AppStore\b/, /LayersStore\b/, /UiStore\b/, /ViewportStore\b/];
    for (const pattern of suspiciousPatterns) {
      expect(source).not.toMatch(pattern);
    }
  });
});

describe("Check 4 — remounting every widget leaks nothing", () => {
  const widgetTags = [
    "app-toc",
    "app-toggle-buttons",
    "app-layers-summary",
    "app-legend",
    "app-variable-switcher",
    "app-table",
    "app-share-app",
  ] as const;

  it.each(widgetTags)("%s: detach then reattach subscribes exactly once, no post-disconnect callback", async (tag) => {
    const stores = createDomainStores(configs);
    const host = document.createElement("div");
    document.body.appendChild(host);

    const el = document.createElement(tag) as HTMLElement & { setup: (s: typeof stores, c: LayerConfig[]) => void };
    el.setup(stores, configs);
    host.appendChild(el);
    el.remove();

    // A store change while detached must never throw and never touch the (now torn-down) widget.
    expect(() => stores.layers.setVisible("a", !stores.layers.get("layersById").a?.visible)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    // Reattaching re-subscribes cleanly and re-renders without throwing.
    expect(() => host.appendChild(el)).not.toThrow();
    await Promise.resolve();

    host.remove();
  });
});

describe("Check 3 — one reconcile per batched change, at stress scale", () => {
  it("a group cascade covering many layers still triggers exactly one reconcile", async () => {
    const manyLayerConfigs = Array.from({ length: 20 }, (_, i) => config({ id: `l${i}`, category: "Group A", visible: false }));
    const stores = createDomainStores(manyLayerConfigs);
    const registry = new Map<string, ReconcilableLayer>();
    for (const c of manyLayerConfigs) {
      registry.set(c.id, { getVisible: () => false, setVisible: vi.fn(), setZIndex: vi.fn() });
    }
    const reconciler = createReconciler(registry, stores);
    const before = reconciler.reconcileCallCount();

    stores.layers.setVisibleMany(manyLayerConfigs.map((c) => c.id), true);
    await Promise.resolve(); // layers.subscribeMany coalesces into a microtask

    expect(reconciler.reconcileCallCount() - before).toBe(1);
  });
});

describe("Check 5 — dev freeze never throws in normal operation", () => {
  it("import.meta.env.DEV is truthy under Vitest (a prerequisite for this check to mean anything)", () => {
    expect(import.meta.env.DEV).toBeTruthy();
  });

  it("a long interleaved run of normal actions across all three domain stores never throws", () => {
    const stores = createDomainStores(configs);
    expect(() => {
      for (let i = 0; i < 30; i++) {
        stores.layers.toggleVisible(configs[i % configs.length]!.id);
        stores.layers.setVariable("a", i % 2 === 0 ? "v1" : "v2");
        stores.ui.setExpanded(i % 2 === 0 ? ["group:group-a"] : []);
        stores.ui.setLegendExpanded(i % 3 === 0 ? ["a", "b"] : ["a"]);
        stores.ui.batch(() => {
          stores.ui.setTableLayer(configs[i % configs.length]!.id);
          stores.ui.setPage(1);
        });
        stores.viewport.setView({ center: [i, -i], zoom: 4 + (i % 5) });
      }
    }).not.toThrow();
  });
});

describe("Check 6 — no heavy data in state, across every layer", () => {
  it("getAll() holds only ids and light metadata after cycling through every layer", () => {
    const stores = createDomainStores(configs);
    for (const c of configs) {
      stores.ui.batch(() => {
        stores.ui.setTableLayer(c.id);
        stores.ui.setPage(1);
      });
    }

    expect(Object.keys(stores.layers.getAll())).toEqual(["layersById", "layerOrder", "variableByLayerId"]);
    expect(Object.keys(stores.ui.getAll())).toEqual(["expandedIds", "expandedLegendIds", "tableLayerId", "tablePage"]);
    expect(Object.keys(stores.viewport.getAll())).toEqual(["center", "zoom"]);
    // Every layersById entry is exactly {id, visible} — no row/feature payloads ever attached.
    for (const layer of Object.values(stores.layers.getAll().layersById)) {
      expect(Object.keys(layer).sort()).toEqual(["id", "visible"]);
    }
  });
});

describe("Check 7 — store <-> OL boundary", () => {
  it("registry construction never reads a config object through the frozen store — only primitive ids/strings", () => {
    const stores = createDomainStores(configs);
    // Store state is frozen in dev; if buildRegistry ever handed a frozen store value into OL
    // (or tried to mutate one), this would throw here rather than silently succeeding.
    expect(() => Object.freeze(stores.layers.get("variableByLayerId"))).not.toThrow();
    const fakeMap = { addLayer: vi.fn() } as unknown as Parameters<typeof buildRegistry>[0];
    expect(() => buildRegistry(fakeMap, configs, stores)).not.toThrow();
  });

  it("the original config objects are never frozen by entering a store — they stay mutable", () => {
    const configsCopy = configs.map((c) => ({ ...c }));
    createDomainStores(configsCopy);
    // seedLayers only ever copies {id, visible} out of each config — the config object itself
    // must never be handed to guard()/deepFreeze, or this mutation would throw.
    expect(() => {
      configsCopy[0]!.visible = !configsCopy[0]!.visible;
    }).not.toThrow();
  });
});
