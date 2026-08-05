import { describe, it, expect, vi, afterEach } from "vitest";
import { loadLayerConfigs, parseLayerConfigs, getLayerConfig, getVariable } from "./index.ts";
import type { LayerConfig } from "./types.ts";

function makeConfig(overrides: Partial<LayerConfig> = {}): LayerConfig {
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadLayerConfigs", () => {
  it("loads every pasted config, with unique ids", () => {
    const configs = loadLayerConfigs();
    const ids = configs.map((c) => c.id);
    expect(ids.sort()).toEqual(["airports", "points", "provinces"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getLayerConfig", () => {
  it("returns the matching record and undefined for an unknown id", () => {
    const configs = loadLayerConfigs();
    expect(getLayerConfig(configs, "points")?.label).toBe("Sample Points");
    expect(getLayerConfig(configs, "nope")).toBeUndefined();
  });
});

describe("getVariable", () => {
  it("resolves the default variable and returns undefined for an unknown one", () => {
    const configs = loadLayerConfigs();
    const points = getLayerConfig(configs, "points");
    expect(points).toBeDefined();
    if (!points) return;
    expect(getVariable(points, points.default_variable)?.id).toBe("tier");
    expect(getVariable(points, "not-a-variable")).toBeUndefined();
  });
});

describe("parseLayerConfigs — validation", () => {
  it("throws on a duplicate id", () => {
    const one = makeConfig();
    const two = makeConfig();
    expect(() => parseLayerConfigs([one, two])).toThrow(/duplicate.*"a"/i);
  });

  it("throws when default_variable is not present in variables", () => {
    const bad = makeConfig({ default_variable: "missing" });
    expect(() => parseLayerConfigs([bad])).toThrow(/"a".*default_variable.*"missing"/i);
  });

  it("throws on empty fields", () => {
    const bad = makeConfig({ fields: [] });
    expect(() => parseLayerConfigs([bad])).toThrow(/"a".*no fields/i);
  });

  it("skips an unsupported type with a warning instead of throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const wfs = { ...makeConfig(), type: "wfs" };

    const result = parseLayerConfigs([wfs]);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
