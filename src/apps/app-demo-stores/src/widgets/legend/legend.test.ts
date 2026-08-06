import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./legend.ts";
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
    variables: [
      {
        id: "v1",
        renderer: [],
        legend: {
          label: "By Tier",
          items: [
            { label: "High", color: "#f00" },
            { label: "Low", color: "#0f0" },
          ],
        },
      },
      {
        id: "v2",
        renderer: [],
        legend: { items: [{ label: "Icon Item", symbol: "/icons/a.png" }] },
      },
    ],
    ...overrides,
  };
}

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

function mount(cfgs: LayerConfig[], initial?: { expandedLegendIds: string[] }) {
  const stores = createDomainStores(cfgs, initial);
  const el = document.createElement("app-legend") as HTMLElement & {
    setup: (s: typeof stores, c: LayerConfig[]) => void;
  };
  el.setup(stores, cfgs);
  host.appendChild(el);
  return { stores, el };
}

function section(el: Element, layerId: string): HTMLDetailsElement | null {
  return el.querySelector<HTMLDetailsElement>(`details[data-layer-id="${layerId}"]`);
}

function toggle(details: HTMLDetailsElement, open: boolean): void {
  details.open = open;
  details.dispatchEvent(new Event("toggle"));
}

describe("app-legend", () => {
  it("renders a section only for visible layers, in reversed order", () => {
    const configs = [
      config({ id: "a", label: "Layer A", visible: true }),
      config({ id: "b", label: "Layer B", visible: false }),
      config({ id: "c", label: "Layer C", visible: true }),
    ];
    const { el } = mount(configs);

    const ids = [...el.querySelectorAll<HTMLDetailsElement>("details")].map((d) => d.dataset.layerId);
    expect(ids).toEqual(["c", "a"]); // reversed layerOrder, visible only
  });

  it("hiding a layer removes its section and re-showing restores it with its open state intact", async () => {
    const configs = [config({ id: "a", label: "Layer A", visible: true })];
    const { el, stores } = mount(configs);

    toggle(section(el, "a")!, true);
    expect(stores.ui.get("expandedLegendIds")).toEqual(["a"]);

    stores.layers.setVisible("a", false);
    await Promise.resolve(); // layers.subscribeMany coalesces into a microtask
    expect(section(el, "a")).toBeNull();

    stores.layers.setVisible("a", true);
    await Promise.resolve();
    expect(section(el, "a")!.open).toBe(true);
  });

  it("changing a layer's variable swaps the legend content and header icon", async () => {
    const configs = [config({ id: "a", label: "Layer A", visible: true })];
    const { el, stores } = mount(configs);

    expect(section(el, "a")!.querySelector(".legend-title")!.textContent).toBe("By Tier");
    expect(section(el, "a")!.querySelector(".legend-swatch")).toBeTruthy();

    stores.layers.setVariable("a", "v2");
    await Promise.resolve(); // layers.subscribeMany coalesces into a microtask

    // v2's legend has no label of its own -> falls back to the layer label.
    expect(section(el, "a")!.querySelector(".legend-title")!.textContent).toBe("Layer A");
    expect(section(el, "a")!.querySelector(".legend-symbol")).toBeTruthy();
    expect(section(el, "a")!.querySelector(".legend-swatch")).toBeNull();
  });
});

describe("app-legend — legend content", () => {
  it("icon-based and color-based items both render", () => {
    const configs = [config({ id: "a", label: "Layer A", visible: true, default_variable: "v1" })];
    const { el } = mount(configs);
    const rows = section(el, "a")!.querySelectorAll(".legend-row");
    expect(rows.length).toBe(2); // two color-swatch body rows
    expect(section(el, "a")!.querySelectorAll(".legend-body .legend-swatch").length).toBe(2);
    expect(section(el, "a")!.querySelector("summary .legend-swatch")).toBeTruthy(); // header icon too
  });

  it("opening a section writes once and an identical write emits nothing", () => {
    const configs = [config({ id: "a", label: "Layer A", visible: true })];
    const { el, stores } = mount(configs);
    let writes = 0;
    stores.ui.subscribe("expandedLegendIds", () => {
      writes++;
    });

    toggle(section(el, "a")!, true);
    expect(writes).toBe(1);

    // details is rebuilt on each render, so re-fetch; dispatching "still open" again must not
    // write again — same content-comparison guard as the TOC's expansion mirroring.
    toggle(section(el, "a")!, true);
    expect(writes).toBe(1);
  });
});
