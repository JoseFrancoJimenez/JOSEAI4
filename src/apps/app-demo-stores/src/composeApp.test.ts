import { describe, it, expect } from "vitest";
import { resolveInitialState } from "./composeApp.ts";
import { encodeShareState } from "./share/url.ts";
import { createDomainStores } from "./state/stores.domain.ts";
import { createSingleStores } from "./state/stores.single.ts";
import type { LayerConfig } from "./config/types.ts";
import type { ShareState } from "./state/selectors.ts";

/**
 * `composeApp` itself boots a real OL map and mounts real DOM widgets — this repo has no
 * established pattern for that under jsdom, and a smoke check confirmed real OL construction
 * throws here (`ResizeObserver is not defined`), so it is not exercised end-to-end in this
 * suite. What Task 26 actually needs verified — a crafted URL restoring store state identically
 * in both wirings — lives entirely in `resolveInitialState` (config + URL -> initial state) and
 * the two store factories, both fully testable without a DOM or a map.
 */

function config(overrides: Partial<LayerConfig> = {}): LayerConfig {
  return {
    type: "vector",
    id: "a",
    label: "A",
    source: { type: "geojson", url: "/a.geojson" },
    visible: true,
    fields: [{ id: "f", label: "F" }],
    default_variable: "v1",
    variables: [{ id: "v1", renderer: [] }],
    ...overrides,
  };
}

const configs: LayerConfig[] = [
  config({ id: "a", visible: true, default_variable: "v1", variables: [{ id: "v1", renderer: [] }, { id: "v2", renderer: [] }] }),
  config({ id: "b", visible: false, default_variable: "w1", variables: [{ id: "w1", renderer: [] }] }),
];

function shareUrl(state: ShareState): string {
  return `?${encodeShareState(state)}`;
}

const craftedState: ShareState = {
  visibleIds: ["b"],
  expandedIds: ["group:x"],
  expandedLegendIds: ["a"],
  variableByLayerId: { a: "v2", b: "w1" },
  tableLayerId: "b",
  tablePage: 2,
  center: [10, 20],
  zoom: 6,
};

describe("resolveInitialState — booting with a crafted URL", () => {
  it("restores the resulting store state to match the crafted share link", () => {
    const initial = resolveInitialState(configs, shareUrl(craftedState));
    const stores = createDomainStores(configs, initial);

    expect(stores.layers.get("layersById")).toEqual({
      a: { id: "a", visible: false },
      b: { id: "b", visible: true },
    });
    expect(stores.layers.get("variableByLayerId")).toEqual({ a: "v2", b: "w1" });
    expect(stores.ui.get("expandedIds")).toEqual(["group:x"]);
    expect(stores.ui.get("expandedLegendIds")).toEqual(["a"]);
    expect(stores.ui.get("tableLayerId")).toBe("b");
    expect(stores.ui.get("tablePage")).toBe(2);
    expect(stores.viewport.get("center")).toEqual([10, 20]);
    expect(stores.viewport.get("zoom")).toBe(6);
  });

  it("booting with no URL params yields config defaults", () => {
    const initial = resolveInitialState(configs, "");
    expect(initial).toEqual({});

    const stores = createDomainStores(configs, initial);
    expect(stores.layers.get("layersById")).toEqual({
      a: { id: "a", visible: true },
      b: { id: "b", visible: false },
    });
    expect(stores.ui.get("tableLayerId")).toBeNull();
  });

  it("both wirings produce identical state from the same URL", () => {
    const initial = resolveInitialState(configs, shareUrl(craftedState));
    const domain = createDomainStores(configs, initial);
    const single = createSingleStores(configs, initial);

    for (const key of ["layersById", "layerOrder", "variableByLayerId"] as const) {
      expect(domain.layers.get(key)).toEqual(single.layers.get(key));
    }
    for (const key of ["expandedIds", "expandedLegendIds", "tableLayerId", "tablePage"] as const) {
      expect(domain.ui.get(key)).toEqual(single.ui.get(key));
    }
    for (const key of ["center", "zoom"] as const) {
      expect(domain.viewport.get(key)).toEqual(single.viewport.get(key));
    }
  });
});
