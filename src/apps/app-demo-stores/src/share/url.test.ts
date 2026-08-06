import { describe, it, expect } from "vitest";
import { encodeShareState, decodeShareState } from "./url.ts";
import type { LayerConfig } from "../config/types.ts";
import type { ShareState } from "../state/selectors.ts";

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
  config({ id: "a", variables: [{ id: "tier", renderer: [] }, { id: "pop", renderer: [] }] }),
  config({ id: "b", variables: [{ id: "province", renderer: [] }] }),
];

function fullState(): ShareState {
  return {
    visibleIds: ["a", "b"],
    expandedIds: ["group:base-maps"],
    expandedLegendIds: ["a"],
    variableByLayerId: { a: "tier", b: "province" },
    tableLayerId: "b",
    tablePage: 3,
    center: [-71.21, 46.81],
    zoom: 8,
  };
}

describe("encodeShareState / decodeShareState — round trip", () => {
  it("round-trips a full state", () => {
    const encoded = encodeShareState(fullState());
    const decoded = decodeShareState(encoded, configs);

    expect(decoded).toEqual({
      visibleIds: ["a", "b"],
      expandedIds: ["group:base-maps"],
      expandedLegendIds: ["a"],
      variableByLayerId: { a: "tier", b: "province" },
      tableLayerId: "b",
      tablePage: 3,
      center: [-71.21, 46.81],
      zoom: 8,
    });
  });

  it("each param independently omitted still decodes", () => {
    const params = new URLSearchParams(encodeShareState(fullState()));
    for (const key of ["vis", "exp", "leg", "var", "tl", "tp", "c", "z"]) {
      const withoutKey = new URLSearchParams(params);
      withoutKey.delete(key);
      expect(() => decodeShareState(withoutKey.toString(), configs)).not.toThrow();
    }
  });

  it("encoding is stable — the same state twice produces the identical string", () => {
    expect(encodeShareState(fullState())).toBe(encodeShareState(fullState()));
  });
});

describe("decodeShareState — validation against configs", () => {
  it("drops unknown layer ids from vis", () => {
    const decoded = decodeShareState("v=1&vis=a,ghost,b", configs);
    expect(decoded.visibleIds).toEqual(["a", "b"]);
  });

  it("drops unknown layer ids from var", () => {
    const decoded = decodeShareState("v=1&var=a:tier,ghost:x", configs);
    expect(decoded.variableByLayerId).toEqual({ a: "tier" });
  });

  it("drops a var entry naming a variable the layer lacks", () => {
    const decoded = decodeShareState("v=1&var=a:province", configs); // "province" belongs to b, not a
    expect(decoded.variableByLayerId).toBeUndefined();
  });
});

describe("decodeShareState — malformed input never throws", () => {
  it("garbage numeric/coordinate input returns a sane partial", () => {
    expect(() => decodeShareState("v=1&z=banana&c=x", configs)).not.toThrow();
    const decoded = decodeShareState("v=1&z=banana&c=x", configs);
    expect(decoded.zoom).toBeUndefined();
    expect(decoded.center).toBeUndefined();
  });

  it("a future/wrong version string decodes to empty", () => {
    expect(decodeShareState("v=99&vis=a,b&z=8", configs)).toEqual({});
  });

  it("no version param at all decodes to empty", () => {
    expect(decodeShareState("vis=a,b", configs)).toEqual({});
  });
});
