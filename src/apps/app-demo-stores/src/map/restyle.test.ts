import { describe, it, expect, vi } from "vitest";
import { restyleChangedVariables } from "./controller.ts";
import type { LayerRegistry, ReconcilableLayer } from "./registry.ts";
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
    variables: [
      { id: "v1", renderer: [{ color: "red" }] },
      { id: "v2", renderer: [{ color: "blue" }] },
    ],
    ...overrides,
  };
}

interface FakeStylableLayer extends ReconcilableLayer {
  setStyle: ReturnType<typeof vi.fn>;
}

function fakeStylableLayer(): FakeStylableLayer {
  return {
    getVisible: () => true,
    setVisible: vi.fn(),
    setZIndex: vi.fn(),
    setStyle: vi.fn(),
  };
}

function fakeRegistry(ids: string[]): LayerRegistry {
  const registry: LayerRegistry = new Map();
  for (const id of ids) registry.set(id, fakeStylableLayer());
  return registry;
}

/** `setStyle` lives only on the fakes (mirroring the real OL layer), not on `ReconcilableLayer`
 * itself — same narrow cast `restyleChangedVariables` uses to reach it. */
function stylableLayer(registry: LayerRegistry, id: string): FakeStylableLayer {
  return registry.get(id) as unknown as FakeStylableLayer;
}

describe("restyleChangedVariables", () => {
  it("restyles exactly the layer whose variable changed", () => {
    const configs = [config({ id: "a" }), config({ id: "b" })];
    const registry = fakeRegistry(["a", "b"]);

    restyleChangedVariables(registry, configs, { a: "v1", b: "v1" }, { a: "v2", b: "v1" });

    expect(stylableLayer(registry, "a").setStyle).toHaveBeenCalledWith([{ color: "blue" }]);
    expect(stylableLayer(registry, "b").setStyle).not.toHaveBeenCalled();
  });

  it("an unchanged record restyles nothing", () => {
    const configs = [config({ id: "a" }), config({ id: "b" })];
    const registry = fakeRegistry(["a", "b"]);

    restyleChangedVariables(registry, configs, { a: "v1", b: "v1" }, { a: "v1", b: "v1" });

    expect(stylableLayer(registry, "a").setStyle).not.toHaveBeenCalled();
    expect(stylableLayer(registry, "b").setStyle).not.toHaveBeenCalled();
  });

  it("a variable id not present in the layer's config is ignored with a warning, not a throw", () => {
    const configs = [config({ id: "a" })];
    const registry = fakeRegistry(["a"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      restyleChangedVariables(registry, configs, { a: "v1" }, { a: "does-not-exist" }),
    ).not.toThrow();

    expect(stylableLayer(registry, "a").setStyle).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("does-not-exist"));
    warn.mockRestore();
  });
});
