import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "./share-app.ts";
import { createDomainStores } from "../../state/stores.domain.ts";
import { encodeShareState } from "../../share/url.ts";
import { selectShareState } from "../../state/selectors.ts";
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

const configs: LayerConfig[] = [config({ id: "a" })];

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
  vi.restoreAllMocks();
});

function mount() {
  const stores = createDomainStores(configs);
  const el = document.createElement("app-share-app") as HTMLElement & {
    setup: (s: typeof stores, c: LayerConfig[]) => void;
  };
  el.setup(stores, configs);
  host.appendChild(el);
  return { stores, el };
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

function clearClipboard(): void {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
}

describe("app-share-app — publishing the link", () => {
  it("click produces the expected URL for a known state", () => {
    const { el, stores } = mount();
    stubClipboard(() => Promise.resolve());
    el.querySelector("button")!.click();

    const expected = encodeShareState(selectShareState(stores));
    expect(location.search).toBe(`?${expected}`);
  });

  it("the address bar is updated via replaceState and the page does not navigate", () => {
    const { el } = mount();
    stubClipboard(() => Promise.resolve());
    const replaceStateSpy = vi.spyOn(history, "replaceState");
    const pathBefore = location.pathname;

    el.querySelector("button")!.click();

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy.mock.calls[0]?.[0]).toBeNull(); // state arg, not a navigation
    expect(location.pathname).toBe(pathBefore); // replaceState never changes the path here
  });

  it("the widget writes nothing to any store", () => {
    const { el, stores } = mount();
    stubClipboard(() => Promise.resolve());
    let writes = 0;
    stores.layers.subscribe("layersById", () => writes++);
    stores.ui.subscribe("expandedIds", () => writes++);
    stores.viewport.subscribe("center", () => writes++);

    el.querySelector("button")!.click();

    expect(writes).toBe(0);
  });
});

describe("app-share-app — clipboard failure degrades honestly", () => {
  it("a rejected clipboard promise still updates the URL and reports the partial failure", async () => {
    const { el } = mount();
    stubClipboard(() => Promise.reject(new Error("denied")));
    const replaceStateSpy = vi.spyOn(history, "replaceState");

    el.querySelector("button")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role="status"]')!.textContent).toMatch(/copy(ing)? failed/i);
  });

  it("a missing navigator.clipboard degrades the same way", () => {
    const { el } = mount();
    clearClipboard();
    const replaceStateSpy = vi.spyOn(history, "replaceState");

    el.querySelector("button")!.click();

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role="status"]')!.textContent).toMatch(/copy(ing)? failed/i);
  });
});
