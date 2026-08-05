import { describe, it, expect, vi } from "vitest";
import { reconcileVisibility, createReconciler, type LayerRegistry, type ReconcilableLayer } from "./registry.ts";
import { createDomainStores } from "../state/stores.domain.ts";
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

function fakeLayer(visible: boolean): ReconcilableLayer {
  let currentlyVisible = visible;
  return {
    getVisible: () => currentlyVisible,
    setVisible: vi.fn((v: boolean) => {
      currentlyVisible = v;
    }),
    setZIndex: vi.fn(),
  };
}

function fakeRegistry(ids: string[], initiallyVisible: string[] = []): LayerRegistry {
  const registry: LayerRegistry = new Map();
  for (const id of ids) registry.set(id, fakeLayer(initiallyVisible.includes(id)));
  return registry;
}

describe("reconcileVisibility", () => {
  it("touches only layers whose visible state actually changes", () => {
    const registry = fakeRegistry(["a", "b", "c"], ["a"]);

    reconcileVisibility(registry, ["a", "b"]);

    expect(registry.get("a")?.setVisible).not.toHaveBeenCalled(); // already visible
    expect(registry.get("b")?.setVisible).toHaveBeenCalledWith(true);
    expect(registry.get("c")?.setVisible).not.toHaveBeenCalled(); // already hidden
  });

  it("a no-op change touches nothing", () => {
    const registry = fakeRegistry(["a", "b"], ["a"]);

    reconcileVisibility(registry, ["a"]);

    expect(registry.get("a")?.setVisible).not.toHaveBeenCalled();
    expect(registry.get("b")?.setVisible).not.toHaveBeenCalled();
  });

  it("toggling one layer of ten touches exactly one", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `l${i}`);
    const registry = fakeRegistry(ids, ids); // all visible

    // hide just l5
    reconcileVisibility(registry, ids.filter((id) => id !== "l5"));

    for (const id of ids) {
      const layer = registry.get(id);
      if (id === "l5") expect(layer?.setVisible).toHaveBeenCalledWith(false);
      else expect(layer?.setVisible).not.toHaveBeenCalled();
    }
  });

  it("z-order follows the order of visibleIds (reversed layerOrder), top first = highest zIndex", () => {
    const registry = fakeRegistry(["a", "b", "c"], ["a", "b", "c"]);

    reconcileVisibility(registry, ["c", "a", "b"]);

    expect(registry.get("c")?.setZIndex).toHaveBeenCalledWith(2);
    expect(registry.get("a")?.setZIndex).toHaveBeenCalledWith(1);
    expect(registry.get("b")?.setZIndex).toHaveBeenCalledWith(0);
  });
});

describe("createReconciler", () => {
  const configs: LayerConfig[] = [
    config({ id: "a", visible: true }),
    config({ id: "b", visible: false }),
  ];

  it("{ immediate: true } paints current state at wire-up", () => {
    const stores = createDomainStores(configs);
    const registry = fakeRegistry(["a", "b"]);

    const reconciler = createReconciler(registry, stores);

    expect(reconciler.reconcileCallCount()).toBe(1);
    expect(registry.get("a")?.setVisible).toHaveBeenCalledWith(true);
    expect(registry.get("b")?.setVisible).not.toHaveBeenCalled(); // stays hidden, no-op
  });

  it("later store changes call reconcile again", async () => {
    const stores = createDomainStores(configs);
    const registry = fakeRegistry(["a", "b"]);
    const reconciler = createReconciler(registry, stores);

    stores.layers.toggleVisible("b");
    await Promise.resolve(); // subscribeMany coalesces into a microtask

    expect(reconciler.reconcileCallCount()).toBe(2);
    expect(registry.get("b")?.setVisible).toHaveBeenCalledWith(true);
  });

  it("a batched cascade write (setVisibleMany) triggers exactly one reconcile", async () => {
    const stores = createDomainStores(configs);
    const registry = fakeRegistry(["a", "b"]);
    const reconciler = createReconciler(registry, stores);

    stores.layers.setVisibleMany(["a", "b"], false);
    await Promise.resolve();

    expect(reconciler.reconcileCallCount()).toBe(2); // 1 immediate + 1 for the whole batch
  });

  it("destroy() removes the subscription — no further reconcile after a later store change", async () => {
    const stores = createDomainStores(configs);
    const registry = fakeRegistry(["a", "b"]);
    const reconciler = createReconciler(registry, stores);

    reconciler.destroy();
    stores.layers.toggleVisible("a");
    await Promise.resolve();

    expect(reconciler.reconcileCallCount()).toBe(1); // only the immediate call
  });
});
