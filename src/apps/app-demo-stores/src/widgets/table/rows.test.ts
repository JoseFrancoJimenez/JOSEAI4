import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLayerRows, paginate, TABLE_PAGE_SIZE } from "./rows.ts";
import type { LayerConfig } from "../../config/types.ts";

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

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLayerRows", () => {
  it("extracts GeoJSON feature properties as rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          type: "FeatureCollection",
          features: [{ properties: { name: "A" } }, { properties: { name: "B" } }],
        }),
      ),
    );

    const rows = await fetchLayerRows(config({ source: { type: "geojson", url: "/a.geojson" } }));
    expect(rows).toEqual([{ name: "A" }, { name: "B" }]);
  });

  it("extracts Esri JSON feature attributes as rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          features: [{ attributes: { code: 1 } }, { attributes: { code: 2 } }],
        }),
      ),
    );

    const rows = await fetchLayerRows(config({ source: { type: "esrijson", url: "/a.json" } }));
    expect(rows).toEqual([{ code: 1 }, { code: 2 }]);
  });

  it("an empty or missing features array yields an empty row list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const rows = await fetchLayerRows(config());
    expect(rows).toEqual([]);
  });

  it("a non-ok response throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    await expect(fetchLayerRows(config())).rejects.toThrow();
  });
});

describe("paginate", () => {
  it("slices the requested 1-indexed page", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(rows, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginate(rows, 3, 10)).toEqual([20, 21, 22, 23, 24]);
  });

  it("an out-of-range page yields an empty slice", () => {
    const rows = [1, 2, 3];
    expect(paginate(rows, 5, 10)).toEqual([]);
  });

  it("defaults to TABLE_PAGE_SIZE when unspecified", () => {
    const rows = Array.from({ length: TABLE_PAGE_SIZE + 1 }, (_, i) => i);
    expect(paginate(rows, 1).length).toBe(TABLE_PAGE_SIZE);
  });
});
