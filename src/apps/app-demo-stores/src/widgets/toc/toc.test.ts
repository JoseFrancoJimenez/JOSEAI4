import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./toc.ts";
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

// Reversed layerOrder is [c, b, a]: c (no category) becomes a root leaf first, then group
// "Group A" is created on first sight of b, and a joins the same group afterward.
const configs: LayerConfig[] = [
  config({ id: "a", label: "Layer A", category: "Group A", visible: true }),
  config({ id: "b", label: "Layer B", category: "Group A", visible: true }),
  config({ id: "c", label: "Layer C", visible: false }),
];

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

function mount(cfgs: LayerConfig[] = configs, initial?: { expandedIds: string[] }) {
  const stores = createDomainStores(cfgs, initial);
  const el = document.createElement("app-toc") as HTMLElement & {
    setup: (s: typeof stores, c: LayerConfig[]) => void;
  };
  el.setup(stores, cfgs);
  host.appendChild(el);
  return { stores, el };
}

function node(el: Element, id: string): HTMLElement {
  return el.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
}

function clickCheckbox(el: Element, id: string): void {
  node(el, id).querySelector(".tree-node__checkbox")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function clickToggle(el: Element, id: string): void {
  node(el, id).querySelector(".tree-node__toggle")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("app-toc — build and checked two-way", () => {
  it("builds groups and root-level leaves per the derivation rules", () => {
    const { el } = mount();
    expect(node(el, "c").dataset.parentId).toBeUndefined(); // root leaf
    expect(node(el, "group:group-a")).toBeTruthy();
    expect(node(el, "a").dataset.parentId).toBe("group:group-a");
    expect(node(el, "b").dataset.parentId).toBe("group:group-a");
  });

  it("initial checked set matches seeded visibility", () => {
    const { el } = mount();
    expect(node(el, "a").getAttribute("aria-checked")).toBe("true");
    expect(node(el, "b").getAttribute("aria-checked")).toBe("true");
    expect(node(el, "c").getAttribute("aria-checked")).toBe("false");
    expect(node(el, "group:group-a").getAttribute("aria-checked")).toBe("true");
  });

  it("checking a group cascades to its layers and produces exactly one layersById emission", () => {
    const { el, stores } = mount([
      config({ id: "a", label: "Layer A", category: "Group A", visible: false }),
      config({ id: "b", label: "Layer B", category: "Group A", visible: false }),
    ]);
    let emits = 0;
    stores.layers.subscribe("layersById", () => {
      emits++;
    });

    clickCheckbox(el, "group:group-a");

    expect(emits).toBe(1);
    expect(stores.layers.get("layersById").a?.visible).toBe(true);
    expect(stores.layers.get("layersById").b?.visible).toBe(true);
  });

  it("a store-side visibility change reflects into the tree without re-emitting to the store", () => {
    const { el, stores } = mount();
    let emits = 0;
    stores.layers.subscribe("layersById", () => {
      emits++;
    });

    stores.layers.setVisible("c", true);

    expect(emits).toBe(1); // only our own explicit write — setChecked never emits
    expect(node(el, "c").getAttribute("aria-checked")).toBe("true");
  });
});

describe("app-toc — checked writes", () => {
  it("toggling a single leaf writes once", () => {
    const { el, stores } = mount();
    let emits = 0;
    stores.layers.subscribe("layersById", () => {
      emits++;
    });

    clickCheckbox(el, "c");

    expect(emits).toBe(1);
    expect(stores.layers.get("layersById").c?.visible).toBe(true);
  });

  it("a group with all layers checked reads back as checked, one unchecked reads as mixed", () => {
    const { el, stores } = mount();
    expect(node(el, "group:group-a").getAttribute("aria-checked")).toBe("true");

    stores.layers.setVisible("a", false);

    expect(node(el, "group:group-a").getAttribute("aria-checked")).toBe("mixed");
  });
});

describe("app-toc — expansion mirroring", () => {
  it("expanding a group writes the id to the store once", () => {
    const { el, stores } = mount(configs, { expandedIds: [] });
    let writes = 0;
    stores.ui.subscribe("expandedIds", () => {
      writes++;
    });

    clickToggle(el, "group:group-a");

    expect(writes).toBe(1);
    expect(stores.ui.get("expandedIds")).toEqual(["group:group-a"]);
  });

  it("collapsing removes it", () => {
    const { el, stores } = mount(configs, { expandedIds: ["group:group-a"] });
    let writes = 0;
    stores.ui.subscribe("expandedIds", () => {
      writes++;
    });

    clickToggle(el, "group:group-a");

    expect(writes).toBe(1);
    expect(stores.ui.get("expandedIds")).toEqual([]);
  });

  it("writing an identical set again produces no store emission", () => {
    const { el, stores } = mount(configs, { expandedIds: [] });
    let writes = 0;
    stores.ui.subscribe("expandedIds", () => {
      writes++;
    });

    clickToggle(el, "group:group-a");
    expect(writes).toBe(1);

    // A duplicate "still expanded" toggle — the accumulated set already matches what's about to
    // be written, so the content-comparison guard must skip the write.
    node(el, "group:group-a").dispatchEvent(
      new CustomEvent("tree-node:toggle", { detail: { expanded: true }, bubbles: true }),
    );
    expect(writes).toBe(1);
  });
});

describe("app-toc — expansion mirroring: reconnect and runaway checks", () => {
  it("detach and reattach restores expansion from the store", () => {
    const { el } = mount(configs, { expandedIds: [] });
    clickToggle(el, "group:group-a");
    expect(node(el, "group:group-a").getAttribute("aria-expanded")).toBe("true");

    el.remove();
    host.appendChild(el);

    expect(node(el, "group:group-a").getAttribute("aria-expanded")).toBe("true");
  });

  it("a run of toggles produces a linear, non-runaway write count", () => {
    const { el, stores } = mount(configs, { expandedIds: [] });
    let writes = 0;
    stores.ui.subscribe("expandedIds", () => {
      writes++;
    });

    for (let i = 0; i < 10; i++) clickToggle(el, "group:group-a");

    expect(writes).toBe(10);
  });
});
