import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./layers-summary.ts";
import "../toggle-buttons/toggle-buttons.ts";
import { createDomainStores } from "../../state/stores.domain.ts";
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

const configs: LayerConfig[] = [
  config({ id: "a", label: "Layer A", visible: true }),
  config({ id: "b", label: "Layer B", visible: false }),
  config({ id: "c", label: "Layer C", visible: true }),
];

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

function sectionItems(el: Element, title: string): string[] {
  const section = [...el.querySelectorAll("section")].find((s) => s.querySelector("h3")?.textContent === title);
  return [...(section?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "");
}

describe("app-layers-summary", () => {
  it("partitions correctly on mount, in reversed layerOrder", () => {
    const stores = createDomainStores(configs);
    const el = document.createElement("app-layers-summary") as HTMLElement & {
      setup: (s: typeof stores, c: LayerConfig[]) => void;
    };
    el.setup(stores, configs);
    host.appendChild(el);

    expect(sectionItems(el, "Visible")).toEqual(["Layer C", "Layer A"]); // reversed order: c, a
    expect(sectionItems(el, "Hidden")).toEqual(["Layer B"]);
  });

  it("empty sections render an explicit empty state", () => {
    const allVisible: LayerConfig[] = [config({ id: "a", label: "Layer A", visible: true })];
    const stores = createDomainStores(allVisible);
    const el = document.createElement("app-layers-summary") as HTMLElement & {
      setup: (s: typeof stores, c: LayerConfig[]) => void;
    };
    el.setup(stores, allVisible);
    host.appendChild(el);

    const hiddenSection = [...el.querySelectorAll("section")].find(
      (s) => s.querySelector("h3")?.textContent === "Hidden",
    )!;
    expect(hiddenSection.querySelector(".empty")?.textContent).toBe("None");
    expect(hiddenSection.querySelectorAll("li").length).toBe(0);
  });

  it("a layer toggled via a toggle-buttons click moves between sections", async () => {
    const stores = createDomainStores(configs);

    const summary = document.createElement("app-layers-summary") as HTMLElement & {
      setup: (s: typeof stores, c: LayerConfig[]) => void;
    };
    summary.setup(stores, configs);
    host.appendChild(summary);

    const toggles = document.createElement("app-toggle-buttons") as HTMLElement & {
      setup: (s: typeof stores, c: LayerConfig[]) => void;
    };
    toggles.setup(stores, configs);
    host.appendChild(toggles);

    expect(sectionItems(summary, "Hidden")).toEqual(["Layer B"]);

    toggles.querySelector<HTMLButtonElement>('button[data-layer-id="b"]')!.click();
    await Promise.resolve(); // subscribeMany coalesces into a microtask

    expect(sectionItems(summary, "Hidden")).toEqual([]);
    expect(sectionItems(summary, "Visible")).toEqual(["Layer C", "Layer B", "Layer A"]);
  });
});
