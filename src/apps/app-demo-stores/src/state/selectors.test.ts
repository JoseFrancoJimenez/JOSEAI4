import { describe, it, expect } from "vitest";
import { createDomainStores } from "./stores.domain.ts";
import {
  selectVisibleIds,
  selectHiddenIds,
  selectOrderedVisibleIds,
  selectActiveVariable,
  selectShareState,
} from "./selectors.ts";
import type { LayerConfig } from "../config/types.ts";

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
  config({ id: "a", visible: true }),
  config({ id: "b", visible: false }),
  config({ id: "c", visible: true }),
];

describe("selectVisibleIds / selectHiddenIds", () => {
  it("partitions layer ids by visibility, in layerOrder", () => {
    const stores = createDomainStores(configs);
    expect(selectVisibleIds(stores)).toEqual(["a", "c"]);
    expect(selectHiddenIds(stores)).toEqual(["b"]);
  });
});

describe("selectOrderedVisibleIds", () => {
  it("returns visible ids in reversed layerOrder", () => {
    const stores = createDomainStores(configs);
    expect(selectOrderedVisibleIds(stores)).toEqual(["c", "a"]);
  });
});

describe("selectActiveVariable", () => {
  it("returns the active variable id, and undefined for an untracked layer", () => {
    const stores = createDomainStores(configs);
    expect(selectActiveVariable(stores, "a")).toBe("v1");
    expect(selectActiveVariable(stores, "nope")).toBeUndefined();
  });
});

describe("selectShareState", () => {
  it("snapshots every field the share link needs", () => {
    const stores = createDomainStores(configs);
    stores.ui.setExpanded(["group:x"]);
    stores.viewport.setView({ center: [1, 2], zoom: 5 });

    expect(selectShareState(stores)).toEqual({
      visibleIds: ["a", "c"],
      expandedIds: ["group:x"],
      expandedLegendIds: [],
      variableByLayerId: { a: "v1", b: "v1", c: "v1" },
      tableLayerId: null,
      tablePage: 1,
      center: [1, 2],
      zoom: 5,
    });
  });
});
