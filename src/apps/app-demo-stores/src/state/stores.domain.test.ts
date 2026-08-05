import { describe, it, expect, vi } from "vitest";
import { createDomainStores } from "./stores.domain.ts";
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

describe("createDomainStores — seeding", () => {
  it("derives layersById, layerOrder, and variableByLayerId from configs", () => {
    const { layers } = createDomainStores(configs);
    expect(layers.get("layersById")).toEqual({
      a: { id: "a", visible: true },
      b: { id: "b", visible: false },
      c: { id: "c", visible: true },
    });
    expect(layers.get("layerOrder")).toEqual(["a", "b", "c"]);
    expect(layers.get("variableByLayerId")).toEqual({ a: "v1", b: "v1", c: "v1" });
  });

  it("seeds ui and viewport with fixed defaults", () => {
    const { ui, viewport } = createDomainStores(configs);
    expect(ui.getAll()).toEqual({
      expandedIds: [],
      expandedLegendIds: [],
      tableLayerId: null,
      tablePage: 1,
    });
    expect(viewport.getAll()).toEqual({ center: [-96, 62], zoom: 4 });
  });

  it("an initial partial overrides individual slice fields", () => {
    const { ui, viewport } = createDomainStores(configs, { tablePage: 3, zoom: 8 });
    expect(ui.get("tablePage")).toBe(3);
    expect(viewport.get("zoom")).toBe(8);
    expect(viewport.get("center")).toEqual([-96, 62]);
  });
});

describe("LayersStore — toggleVisible", () => {
  it("flips one layer and leaves others by identical reference", () => {
    const { layers } = createDomainStores(configs);
    const before = layers.get("layersById");
    layers.toggleVisible("b");
    const after = layers.get("layersById");
    expect(after["b"]?.visible).toBe(true);
    expect(after["a"]).toBe(before["a"]);
    expect(after["c"]).toBe(before["c"]);
  });
});

describe("LayersStore — setVisibleMany", () => {
  it("emits layersById exactly once for N layers", () => {
    const { layers } = createDomainStores(configs);
    const cb = vi.fn();
    layers.subscribe("layersById", cb);

    layers.setVisibleMany(["a", "b", "c"], false);

    expect(cb).toHaveBeenCalledTimes(1);
    const byId = layers.get("layersById");
    expect(byId["a"]?.visible).toBe(false);
    expect(byId["b"]?.visible).toBe(false);
    expect(byId["c"]?.visible).toBe(false);
  });
});

describe("ViewportStore — setView", () => {
  it("emits center and zoom once each", () => {
    const { viewport } = createDomainStores(configs);
    const centerCb = vi.fn();
    const zoomCb = vi.fn();
    viewport.subscribe("center", centerCb);
    viewport.subscribe("zoom", zoomCb);

    viewport.setView({ center: [10, 20], zoom: 9 });

    expect(centerCb).toHaveBeenCalledTimes(1);
    expect(zoomCb).toHaveBeenCalledTimes(1);
  });
});

describe("no-op actions emit nothing", () => {
  it("setVisible to the value it already holds is a no-op", () => {
    const { layers } = createDomainStores(configs);
    const cb = vi.fn();
    layers.subscribe("layersById", cb);

    layers.setVisible("a", true);

    expect(cb).not.toHaveBeenCalled();
  });

  it("setVariable to the value it already holds is a no-op", () => {
    const { layers } = createDomainStores(configs);
    const cb = vi.fn();
    layers.subscribe("variableByLayerId", cb);

    layers.setVariable("a", "v1");

    expect(cb).not.toHaveBeenCalled();
  });
});
