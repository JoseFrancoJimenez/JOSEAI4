import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "./table.ts";
import { createDomainStores } from "../../state/stores.domain.ts";
import type { LayerConfig } from "../../config/types.ts";
import { TABLE_PAGE_SIZE } from "./rows.ts";

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
  config({
    id: "a",
    label: "Layer A",
    source: { type: "geojson", url: "/a.geojson" },
    fields: [
      { id: "name", label: "Name" },
      { id: "pop", label: "Population" },
    ],
  }),
  config({ id: "b", label: "Layer B", source: { type: "geojson", url: "/b.geojson" }, fields: [{ id: "code", label: "Code" }] }),
];

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response;
}

function featureCollection(names: string[]): unknown {
  return { type: "FeatureCollection", features: names.map((name) => ({ properties: { name } })) };
}

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  // Default: an empty collection, so tests that don't care about rows aren't slowed by a real
  // network attempt against a relative test-fixture URL.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(featureCollection([]))));
});

afterEach(() => {
  host.remove();
  vi.unstubAllGlobals();
});

function mount(cfgs: LayerConfig[] = configs, initial?: { tableLayerId?: string | null; tablePage?: number }) {
  const stores = createDomainStores(cfgs, initial);
  const el = document.createElement("app-table") as HTMLElement & {
    setup: (s: typeof stores, c: LayerConfig[]) => void;
  };
  el.setup(stores, cfgs);
  host.appendChild(el);
  return { stores, el };
}

function columnIds(el: Element): (string | undefined)[] {
  return [...el.querySelectorAll("th")].map((th) => (th as HTMLElement).dataset.fieldId);
}

function bodyRows(el: Element): HTMLTableRowElement[] {
  return [...el.querySelectorAll("tbody tr")] as HTMLTableRowElement[];
}

/** Flushes pending microtasks (a fetch chain hops through several: the mock promise, `.json()`,
 * and the widget's own `.then`) — a macrotask tick guarantees all of them have settled. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("app-table — combobox and columns", () => {
  it("columns match the selected layer's fields, in config order", () => {
    const { el } = mount(configs, { tableLayerId: "a" });
    expect(columnIds(el)).toEqual(["name", "pop"]);
  });

  it("changing the layer swaps the columns", async () => {
    const { el } = mount(configs, { tableLayerId: "a" });
    const select = el.querySelector("select")!;
    select.value = "b";
    select.dispatchEvent(new Event("change"));
    await Promise.resolve(); // ui.subscribeMany coalesces into a microtask
    expect(columnIds(el)).toEqual(["code"]);
  });

  it("changing the layer emits tableLayerId and tablePage once each (batch proof)", () => {
    const { el, stores } = mount(configs, { tableLayerId: "a", tablePage: 3 });
    let tableLayerWrites = 0;
    let pageWrites = 0;
    stores.ui.subscribe("tableLayerId", () => {
      tableLayerWrites++;
    });
    stores.ui.subscribe("tablePage", () => {
      pageWrites++;
    });

    const select = el.querySelector("select")!;
    select.value = "b";
    select.dispatchEvent(new Event("change"));

    expect(tableLayerWrites).toBe(1);
    expect(pageWrites).toBe(1);
    expect(stores.ui.get("tableLayerId")).toBe("b");
    expect(stores.ui.get("tablePage")).toBe(1);
  });
});

describe("app-table — combobox reflects external state", () => {
  it("an external store change to tableLayerId updates the select", async () => {
    const { el, stores } = mount(configs, { tableLayerId: "a" });
    stores.ui.setTableLayer("b");
    await Promise.resolve(); // ui.subscribeMany coalesces into a microtask
    const select = el.querySelector("select")!;
    expect(select.value).toBe("b");
    expect(columnIds(el)).toEqual(["code"]);
  });

  it("a null tableLayerId falls back to the first layer without writing", () => {
    const { el, stores } = mount(configs, { tableLayerId: null });
    let writes = 0;
    stores.ui.subscribe("tableLayerId", () => {
      writes++;
    });

    const select = el.querySelector("select")!;
    expect(select.value).toBe("a");
    expect(columnIds(el)).toEqual(["name", "pop"]);
    expect(writes).toBe(0);
    expect(stores.ui.get("tableLayerId")).toBeNull();
  });
});

describe("app-table — rows and pagination", () => {
  it("rows render for the selected layer and page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(featureCollection(["Alpha", "Beta"]))));
    const { el } = mount([config({ id: "a", label: "Layer A", fields: [{ id: "name", label: "Name" }] })], {
      tableLayerId: "a",
    });
    await flush();

    const rows = bodyRows(el);
    expect(rows.map((r) => r.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("changing the page fetches once and re-renders", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(featureCollection(Array.from({ length: TABLE_PAGE_SIZE + 2 }, (_, i) => `Row ${i}`))),
    );
    vi.stubGlobal("fetch", fetchMock);
    const cfgs = [config({ id: "a", label: "Layer A", fields: [{ id: "name", label: "Name" }] })];
    const { stores, el } = mount(cfgs, { tableLayerId: "a" });
    await flush();

    stores.ui.setPage(2);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1); // cached — same layer, no re-fetch
    expect(bodyRows(el).map((r) => r.textContent)).toEqual(["Row 10", "Row 11"]);
  });

  it("changing the layer resets to page 1 and issues one fetch, not two", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(featureCollection(["X"])));
    vi.stubGlobal("fetch", fetchMock);
    const { el, stores } = mount(configs, { tableLayerId: "a", tablePage: 3 });
    await flush();
    fetchMock.mockClear();

    const select = el.querySelector("select")!;
    select.value = "b";
    select.dispatchEvent(new Event("change"));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stores.ui.get("tablePage")).toBe(1);
  });

  it("an error renders the error state without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const { el } = mount([config({ id: "a", label: "Layer A" })], { tableLayerId: "a" });
    await flush();

    expect(bodyRows(el)[0]?.textContent).toBe("Failed to load data.");
  });
});

describe("app-table — pager bounds", () => {
  it("disables the pager at the bounds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(featureCollection(["only-one"]))));
    const { el } = mount([config({ id: "a", label: "Layer A" })], { tableLayerId: "a" });
    await flush();

    const buttons = [...el.querySelectorAll("button")] as HTMLButtonElement[];
    expect(buttons[0]?.disabled).toBe(true); // page 1
    expect(buttons[1]?.disabled).toBe(true); // fewer rows than a full page
  });
});

describe("app-table — store boundary", () => {
  it("no row data appears in any store slice", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(featureCollection(["Alpha"]))));
    const { stores } = mount([config({ id: "a", label: "Layer A" })], { tableLayerId: "a" });
    await flush();

    expect(Object.keys(stores.ui.getAll())).toEqual(["expandedIds", "expandedLegendIds", "tableLayerId", "tablePage"]);
    expect(Object.keys(stores.layers.getAll())).toEqual(["layersById", "layerOrder", "variableByLayerId"]);
  });
});

describe("app-table — stale-response guard", () => {
  it("an out-of-order response for a superseded request is dropped", async () => {
    let resolveFirst!: (r: Response) => void;
    let resolveSecond!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveSecond = resolve)));
    vi.stubGlobal("fetch", fetchMock);

    const cfgs = [
      config({ id: "a", label: "Layer A", source: { type: "geojson", url: "/a.geojson" }, fields: [{ id: "name", label: "Name" }] }),
      config({ id: "b", label: "Layer B", source: { type: "geojson", url: "/b.geojson" }, fields: [{ id: "name", label: "Name" }] }),
    ];
    const { el, stores } = mount(cfgs, { tableLayerId: "a" });

    stores.ui.setTableLayer("b"); // supersedes the in-flight "a" request
    await Promise.resolve();

    // Resolve the later ("b") request first, then the earlier ("a") one — the earlier result
    // must not paint over the later, already-current one.
    resolveSecond(jsonResponse(featureCollection(["From B"])));
    await flush();
    resolveFirst(jsonResponse(featureCollection(["From A"])));
    await flush();

    expect(bodyRows(el).map((r) => r.textContent)).toEqual(["From B"]);
  });
});
