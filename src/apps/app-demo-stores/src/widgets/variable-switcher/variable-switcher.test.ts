import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./variable-switcher.ts";
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
      { id: "v1", renderer: [], legend: { label: "By Tier", items: [] } },
      { id: "v2", renderer: [] }, // no legend -> falls back to raw id
    ],
    ...overrides,
  };
}

const configs: LayerConfig[] = [
  config({ id: "a", label: "Layer A" }),
  config({ id: "b", label: "Layer B", default_variable: "w1", variables: [{ id: "w1", renderer: [] }] }),
];

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

function mount(cfgs: LayerConfig[] = configs) {
  const stores = createDomainStores(cfgs);
  const el = document.createElement("app-variable-switcher") as HTMLElement & {
    setup: (s: typeof stores, c: LayerConfig[]) => void;
  };
  el.setup(stores, cfgs);
  host.appendChild(el);
  return { stores, el };
}

function selects(el: Element): { layer: HTMLSelectElement; variable: HTMLSelectElement } {
  const [layer, variable] = [...el.querySelectorAll("select")];
  return { layer: layer as HTMLSelectElement, variable: variable as HTMLSelectElement };
}

describe("app-variable-switcher", () => {
  it("the variable list repopulates when the layer selection changes", () => {
    const { el } = mount();
    const { layer, variable } = selects(el);

    expect([...variable.options].map((o) => o.value)).toEqual(["v1", "v2"]);

    layer.value = "b";
    layer.dispatchEvent(new Event("change"));

    expect([...variable.options].map((o) => o.value)).toEqual(["w1"]);
  });

  it("the current value reflects the store on mount and on external change", () => {
    const { el, stores } = mount();
    const { variable } = selects(el);
    expect(variable.value).toBe("v1");

    stores.layers.setVariable("a", "v2");
    expect(variable.value).toBe("v2");
  });

  it("changing it writes once", () => {
    const { el, stores } = mount();
    const { variable } = selects(el);
    let writes = 0;
    stores.layers.subscribe("variableByLayerId", () => {
      writes++;
    });

    variable.value = "v2";
    variable.dispatchEvent(new Event("change"));

    expect(writes).toBe(1);
    expect(stores.layers.get("variableByLayerId").a).toBe("v2");
  });
});

describe("app-variable-switcher — local layer selection", () => {
  it("the local layer selection is not written to any store", () => {
    const { el, stores } = mount();
    const { layer } = selects(el);
    let layersWrites = 0;
    let uiWrites = 0;
    stores.layers.subscribe("variableByLayerId", () => {
      layersWrites++;
    });
    stores.layers.subscribe("layersById", () => {
      layersWrites++;
    });
    stores.ui.subscribe("expandedIds", () => {
      uiWrites++;
    });

    layer.value = "b";
    layer.dispatchEvent(new Event("change"));

    expect(layersWrites).toBe(0);
    expect(uiWrites).toBe(0);
  });

  it("a layer with a single variable still renders correctly", () => {
    const { el } = mount([config({ id: "b", label: "Layer B", default_variable: "w1", variables: [{ id: "w1", renderer: [] }] })]);
    const { variable } = selects(el);
    expect(variable.options.length).toBe(1);
    expect(variable.value).toBe("w1");
  });
});
