import { describe, it, expect } from "vitest";
import { buildRestoredState } from "./restore.ts";
import { seedLayers } from "./seed.ts";
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
  config({ id: "a", visible: true, default_variable: "v1", variables: [{ id: "v1", renderer: [] }] }),
  config({ id: "b", visible: false, default_variable: "w1", variables: [{ id: "w1", renderer: [] }] }),
  config({ id: "c", visible: true, default_variable: "x1", variables: [{ id: "x1", renderer: [] }] }),
];

describe("buildRestoredState", () => {
  it("an empty decoded partial changes nothing (config defaults stand)", () => {
    expect(buildRestoredState(configs, {})).toEqual({});
  });

  it("visibleIds sets every layer's visibility explicitly, not just the mentioned ones", () => {
    const result = buildRestoredState(configs, { visibleIds: ["b"] });
    expect(result.layersById).toEqual({
      a: { id: "a", visible: false },
      b: { id: "b", visible: true },
      c: { id: "c", visible: false },
    });
  });

  it("a layer omitted from a partial variableByLayerId keeps its config default, not undefined", () => {
    const result = buildRestoredState(configs, { variableByLayerId: { a: "v1" } });
    expect(result.variableByLayerId).toEqual({ a: "v1", b: "w1", c: "x1" });
  });

  it("layerOrder is never touched — it stays config-derived", () => {
    const result = buildRestoredState(configs, { visibleIds: ["a"] });
    expect(result.layerOrder).toBeUndefined();
    expect(seedLayers(configs).layerOrder).toEqual(["a", "b", "c"]);
  });

  it("passes ui/viewport fields straight through when present", () => {
    const result = buildRestoredState(configs, {
      expandedIds: ["group:x"],
      expandedLegendIds: ["a"],
      tableLayerId: "b",
      tablePage: 4,
      center: [1, 2],
      zoom: 5,
    });
    expect(result).toMatchObject({
      expandedIds: ["group:x"],
      expandedLegendIds: ["a"],
      tableLayerId: "b",
      tablePage: 4,
      center: [1, 2],
      zoom: 5,
    });
  });

  it("a null tableLayerId in the decoded partial is honored, not treated as absent", () => {
    const result = buildRestoredState(configs, { tableLayerId: null });
    expect(result.tableLayerId).toBeNull();
  });
});
