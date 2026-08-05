import { describe, it, expect } from "vitest";
import { slugify, buildTreeDefs } from "./tree-defs.ts";
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

describe("slugify — URL contract, pinned cases", () => {
  const cases: [string, string][] = [
    ["Base Maps", "base-maps"],
    ["  leading and trailing  ", "leading-and-trailing"],
    ["Punctuation!! Here??", "punctuation-here"],
    ["Multiple---Dashes", "multiple-dashes"],
    ["Café Zone", "caf-zone"],
    ["UPPER CASE", "upper-case"],
    ["---trim-me---", "trim-me"],
    ["a  b   c", "a-b-c"],
  ];

  it.each(cases)("slugify(%j) === %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("buildTreeDefs — empty input", () => {
  it("yields an empty def list", () => {
    expect(buildTreeDefs([], { expandedIds: [] })).toEqual([]);
  });
});

describe("buildTreeDefs — uncategorized layers", () => {
  it("a layer without category becomes a root-level leaf", () => {
    const defs = buildTreeDefs([config({ id: "solo" })], { expandedIds: [] });
    expect(defs).toEqual([{ id: "solo", parent_id: null, type: "checkbox" }]);
  });
});

describe("buildTreeDefs — group id namespacing", () => {
  it("a layer id that looks like a group's slug does not collide with the group's own id", () => {
    const configs: LayerConfig[] = [
      config({ id: "base-maps" }),
      config({ id: "roads", category: "Base Maps" }),
    ];
    const defs = buildTreeDefs(configs, { expandedIds: [] });
    const ids = defs.map((d) => d.id);
    expect(ids).toContain("base-maps");
    expect(ids.filter((id) => id === "group:base-maps")).toHaveLength(1);
  });
});

describe("buildTreeDefs — group order", () => {
  it("orders groups by first appearance in reversed layer order", () => {
    const configs: LayerConfig[] = [
      config({ id: "a", category: "Alpha" }),
      config({ id: "b", category: "Beta" }),
      config({ id: "c", category: "Alpha" }),
    ];
    const defs = buildTreeDefs(configs, { expandedIds: [] });
    const groupIds = defs.filter((d) => d.parent_id === null && d.id.startsWith("group:")).map((d) => d.id);
    expect(groupIds).toEqual(["group:alpha", "group:beta"]);
  });

  it("keeps layers within a group in reversed layerOrder", () => {
    const configs: LayerConfig[] = [
      config({ id: "a", category: "Alpha" }),
      config({ id: "b", category: "Alpha" }),
      config({ id: "c", category: "Alpha" }),
    ];
    const defs = buildTreeDefs(configs, { expandedIds: [] });
    const children = defs.filter((d) => d.parent_id === "group:alpha").map((d) => d.id);
    expect(children).toEqual(["c", "b", "a"]);
  });
});

describe("buildTreeDefs — expandedIds", () => {
  it("stamps expanded: true on exactly the named groups", () => {
    const configs: LayerConfig[] = [
      config({ id: "a", category: "Alpha" }),
      config({ id: "b", category: "Beta" }),
    ];
    const defs = buildTreeDefs(configs, { expandedIds: ["group:alpha"] });
    expect(defs.find((d) => d.id === "group:alpha")?.expanded).toBe(true);
    expect(defs.find((d) => d.id === "group:beta")?.expanded).toBe(false);
  });
});
