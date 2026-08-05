import { describe, it, expect } from "vitest";
import { createSingleStores } from "./stores.single.ts";
import { runStoreContractTests, contractConfigs } from "./stores.contract.ts";

runStoreContractTests("createSingleStores", createSingleStores);

describe("createSingleStores — instance identity", () => {
  it("returns the identical AppStore instance for all three facade members", () => {
    const { layers, ui, viewport } = createSingleStores(contractConfigs);
    expect(layers).toBe(ui);
    expect(ui).toBe(viewport);
  });
});

describe("createSingleStores — recorded finding: getAll() scope diverges from the domain wiring", () => {
  it("ui.getAll() returns the whole AppState, not just UiSlice's keys, because layers/ui/viewport share one instance", () => {
    const { ui } = createSingleStores(contractConfigs);
    const keys = Object.keys(ui.getAll());
    // UiSlice's own keys are present, but so are layers' and viewport's -- a widget that
    // iterates getAll() instead of reading named keys would see slices it didn't ask for. Not a
    // bug to fix in this task: it's an inherent consequence of one shared Store instance, and
    // StoreLike.getAll()'s static return type (Readonly<UiSlice>) doesn't reflect it.
    expect(keys).toEqual(expect.arrayContaining(["expandedIds", "layersById", "center"]));
  });
});
