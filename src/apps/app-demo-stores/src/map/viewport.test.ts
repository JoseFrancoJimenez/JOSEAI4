import { describe, it, expect, vi } from "vitest";
import { fromLonLat } from "ol/proj.js";
import { wireViewport, type ViewportMap, type ViewportView } from "./controller.ts";
import { createDomainStores } from "../state/stores.domain.ts";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../state/seed.ts";

function fakeMap(initialCenterProjected: number[], initialZoom: number) {
  let center = initialCenterProjected;
  let zoom = initialZoom;
  let moveEndListener: (() => void) | null = null;

  const view: ViewportView = {
    getCenter: () => center,
    getZoom: () => zoom,
    setCenter: (c) => {
      center = c;
    },
    setZoom: (z) => {
      zoom = z;
    },
  };

  const map: ViewportMap = {
    getView: () => view,
    on: (_type, listener) => {
      moveEndListener = listener;
    },
    un: () => {
      moveEndListener = null;
    },
  };

  return {
    map,
    view,
    /** Simulates the user panning/zooming the real map directly (bypassing the store). */
    moveTo: (c: number[], z: number) => {
      center = c;
      zoom = z;
    },
    /** Simulates OL's `moveend` firing — asynchronous in real OL, so this may run well after any
     * synchronous `applyingFromStore` guard window has already closed. */
    triggerMoveEnd: () => moveEndListener?.(),
  };
}

describe("wireViewport", () => {
  it("a store write applies to the map and does not re-enter the store write path", () => {
    const stores = createDomainStores([]);
    const fake = fakeMap(fromLonLat(DEFAULT_CENTER), DEFAULT_ZOOM);
    const setViewSpy = vi.spyOn(stores.viewport, "setView");
    wireViewport(fake.map, stores);

    stores.viewport.setView({ center: [10, 20], zoom: 6 });

    expect(fake.view.getCenter()).toEqual(fromLonLat([10, 20]));
    expect(fake.view.getZoom()).toBe(6);

    // The moveend that real OL fires asynchronously after a programmatic view change must not
    // write back to the store — the view now matches the store within tolerance.
    fake.triggerMoveEnd();
    expect(setViewSpy).toHaveBeenCalledTimes(1);
  });

  it("a map move writes once to the store", () => {
    const stores = createDomainStores([]);
    const fake = fakeMap(fromLonLat(DEFAULT_CENTER), DEFAULT_ZOOM);
    const setViewSpy = vi.spyOn(stores.viewport, "setView");
    wireViewport(fake.map, stores);

    fake.moveTo(fromLonLat([10, 20]), 6);
    fake.triggerMoveEnd();

    expect(setViewSpy).toHaveBeenCalledTimes(1);
    const [lon, lat] = stores.viewport.get("center");
    expect(lon).toBeCloseTo(10, 6);
    expect(lat).toBeCloseTo(20, 6);
    expect(stores.viewport.get("zoom")).toBe(6);
  });

  it("a round-trip of 50 alternating updates settles — write count stays linear, not runaway", () => {
    const stores = createDomainStores([]);
    const fake = fakeMap(fromLonLat(DEFAULT_CENTER), DEFAULT_ZOOM);
    const setViewSpy = vi.spyOn(stores.viewport, "setView");
    wireViewport(fake.map, stores);

    for (let i = 0; i < 50; i++) {
      if (i % 2 === 0) {
        stores.viewport.setView({ center: [i, i], zoom: 4 + (i % 5) });
      } else {
        fake.moveTo(fromLonLat([i, i]), 4 + (i % 5));
      }
      fake.triggerMoveEnd();
    }

    // 25 store-driven writes (explicit) + 25 map-driven writes (one per move) = 50, never more.
    expect(setViewSpy).toHaveBeenCalledTimes(50);
  });

  it("sub-tolerance drift is treated as no change", () => {
    const stores = createDomainStores([]);
    const fake = fakeMap(fromLonLat(DEFAULT_CENTER), DEFAULT_ZOOM);
    const setViewSpy = vi.spyOn(stores.viewport, "setView");
    wireViewport(fake.map, stores);

    fake.moveTo(fromLonLat([DEFAULT_CENTER[0] + 1e-6, DEFAULT_CENTER[1] + 1e-6]), DEFAULT_ZOOM + 1e-5);
    fake.triggerMoveEnd();

    expect(setViewSpy).not.toHaveBeenCalled();
  });
});

describe("wireViewport — teardown", () => {
  it("destroy() removes both the store subscriptions and the moveend listener", () => {
    const stores = createDomainStores([]);
    const fake = fakeMap(fromLonLat(DEFAULT_CENTER), DEFAULT_ZOOM);
    const setViewSpy = vi.spyOn(stores.viewport, "setView");
    const controller = wireViewport(fake.map, stores);

    controller.destroy();

    stores.viewport.setView({ center: [1, 1], zoom: 2 });
    expect(fake.view.getCenter()).toEqual(fromLonLat(DEFAULT_CENTER)); // unchanged — no subscriber left to apply it

    fake.moveTo(fromLonLat([5, 5]), 3);
    fake.triggerMoveEnd(); // listener was un-registered; fake no-ops, but assert no extra write either
    expect(setViewSpy).toHaveBeenCalledTimes(1); // only our own explicit call above
  });
});
