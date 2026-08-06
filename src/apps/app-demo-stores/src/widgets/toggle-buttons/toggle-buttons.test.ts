import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./toggle-buttons.ts";
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

function mount() {
  const stores = createDomainStores(configs);
  const el = document.createElement("app-toggle-buttons") as HTMLElement & {
    setup: (stores: ReturnType<typeof createDomainStores>, configs: LayerConfig[]) => void;
  };
  el.setup(stores, configs);
  host.appendChild(el);
  return { stores, el };
}

describe("app-toggle-buttons", () => {
  it("renders one button per config layer in config order", () => {
    const { el } = mount();
    const buttons = el.querySelectorAll("button");
    expect(buttons.length).toBe(3);
    expect([...buttons].map((b) => b.dataset.layerId)).toEqual(["a", "b", "c"]);
    expect([...buttons].map((b) => b.textContent)).toEqual(["Layer A", "Layer B", "Layer C"]);
  });

  it("initial pressed state matches seeded config", () => {
    const { el } = mount();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "true"]);
  });

  it("a store change updates the button without a click", () => {
    const { el, stores } = mount();
    stores.layers.setVisible("b", true);
    const button = el.querySelector<HTMLButtonElement>('button[data-layer-id="b"]')!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("a click writes to the store exactly once", () => {
    const { el, stores } = mount();
    let writes = 0;
    stores.layers.subscribe("layersById", () => {
      writes++;
    });

    const button = el.querySelector<HTMLButtonElement>('button[data-layer-id="a"]')!;
    button.click();

    expect(writes).toBe(1);
    expect(stores.layers.get("layersById").a?.visible).toBe(false);
  });

  it("disconnect removes the subscription — no update after a post-disconnect store change", () => {
    const { el, stores } = mount();
    el.remove();

    stores.layers.setVisible("a", false);

    const button = el.querySelector<HTMLButtonElement>('button[data-layer-id="a"]')!;
    expect(button.getAttribute("aria-pressed")).toBe("true"); // unchanged — stale after disconnect
  });
});
