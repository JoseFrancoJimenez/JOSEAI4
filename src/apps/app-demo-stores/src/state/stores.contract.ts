import { describe, it, expect, vi } from "vitest";
import type { LayerConfig } from "../config/types.ts";
import type { AppState } from "./keys.ts";
import type { AppStores } from "./facade.ts";

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

type CreateStores = (configs: LayerConfig[], initial?: Partial<AppState>) => AppStores;

function describeSeeding(label: string, createStores: CreateStores): void {
  describe(`${label} — seeding`, () => {
    it("derives layersById, layerOrder, and variableByLayerId from configs", () => {
      const { layers } = createStores(configs);
      expect(layers.get("layersById")).toEqual({
        a: { id: "a", visible: true },
        b: { id: "b", visible: false },
        c: { id: "c", visible: true },
      });
      expect(layers.get("layerOrder")).toEqual(["a", "b", "c"]);
      expect(layers.get("variableByLayerId")).toEqual({ a: "v1", b: "v1", c: "v1" });
    });

    it("seeds ui and viewport with fixed defaults", () => {
      // Per-key, not getAll(): the single-store wiring's getAll() returns the whole AppState,
      // not just this slice — see the recorded finding in stores.single.test.ts. get() per key
      // stays correctly scoped in both wirings, which is the guarantee that actually matters.
      const { ui, viewport } = createStores(configs);
      expect(ui.get("expandedIds")).toEqual([]);
      expect(ui.get("expandedLegendIds")).toEqual([]);
      expect(ui.get("tableLayerId")).toBeNull();
      expect(ui.get("tablePage")).toBe(1);
      expect(viewport.get("center")).toEqual([-96, 62]);
      expect(viewport.get("zoom")).toBe(4);
    });

    it("an initial partial overrides individual slice fields", () => {
      const { ui, viewport } = createStores(configs, { tablePage: 3, zoom: 8 });
      expect(ui.get("tablePage")).toBe(3);
      expect(viewport.get("zoom")).toBe(8);
      expect(viewport.get("center")).toEqual([-96, 62]);
    });
  });
}

function describeLayerActions(label: string, createStores: CreateStores): void {
  describe(`${label} — toggleVisible`, () => {
    it("flips one layer and leaves others by identical reference", () => {
      const { layers } = createStores(configs);
      const before = layers.get("layersById");
      layers.toggleVisible("b");
      const after = layers.get("layersById");
      expect(after["b"]?.visible).toBe(true);
      expect(after["a"]).toBe(before["a"]);
      expect(after["c"]).toBe(before["c"]);
    });
  });

  describe(`${label} — setVisibleMany`, () => {
    it("emits layersById exactly once for N layers", () => {
      const { layers } = createStores(configs);
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
}

function describeViewportAndNoOps(label: string, createStores: CreateStores): void {
  describe(`${label} — setView`, () => {
    it("emits center and zoom once each", () => {
      const { viewport } = createStores(configs);
      const centerCb = vi.fn();
      const zoomCb = vi.fn();
      viewport.subscribe("center", centerCb);
      viewport.subscribe("zoom", zoomCb);

      viewport.setView({ center: [10, 20], zoom: 9 });

      expect(centerCb).toHaveBeenCalledTimes(1);
      expect(zoomCb).toHaveBeenCalledTimes(1);
    });
  });

  describe(`${label} — no-op actions emit nothing`, () => {
    it("setVisible to the value it already holds is a no-op", () => {
      const { layers } = createStores(configs);
      const cb = vi.fn();
      layers.subscribe("layersById", cb);

      layers.setVisible("a", true);

      expect(cb).not.toHaveBeenCalled();
    });

    it("setVariable to the value it already holds is a no-op", () => {
      const { layers } = createStores(configs);
      const cb = vi.fn();
      layers.subscribe("variableByLayerId", cb);

      layers.setVariable("a", "v1");

      expect(cb).not.toHaveBeenCalled();
    });
  });
}

/**
 * Same assertions run against both wirings' factories (Task 10's createDomainStores and Task
 * 11's createSingleStores), so any behavioral divergence between them shows up as a failing
 * test here rather than being discovered later by a widget.
 */
export function runStoreContractTests(label: string, createStores: CreateStores): void {
  describeSeeding(label, createStores);
  describeLayerActions(label, createStores);
  describeViewportAndNoOps(label, createStores);
}

export { configs as contractConfigs };
