# Base `Store` + `app-demo-stores` — build plan

## Context & scope

Two deliverables:

1. **The base `Store<TState>` tool** in `src/lib/core/` — the pub/sub, immutable-by-convention
   store specified in `docs/store-brief.md`. It does not exist yet.
2. **`src/apps/app-demo-stores/`** — one app that puts that store under real pressure: an
   OpenLayers map, seven widgets reading and writing the same slices, and a shareable URL.

The app exists to answer one question: **does this store hold up in a real app?** Its value is
the friction it surfaces, not the features it ships. Findings go back into
`docs/store-brief.md` (final task).

The app is built in **two wirings** — one `AppStore` holding every key, and three domain
stores — with **identical widget code** across both. If a widget ever needs to know which
wiring it's in, the design has failed and that is a finding worth reporting.

This file is a task breakdown. Each task is self-contained: it names its dependencies, the
files it touches, what to do, what to test, and when it's done. A fresh session should be able
to pick up any single task, read the settled-context sections above it, and finish it in one
sitting. **Execute in order, commit between each.** The **Settled decisions** section is shared
context every task depends on — it is decided, not up for re-litigation.

## Project rules (apply throughout)

Vite + TypeScript, **vanilla Web Components, light DOM (no Shadow DOM)**, props-down /
events-up, strict TypeScript with `#`-private fields, ESM, tests co-located as `*.test.ts`.
Build the minimum that works; add abstraction only when a concrete need forces it. Run and
iterate on tests in the **terminal**, not in chat.

**Library vs app.** `src/lib` holds self-contained, reusable code — including reusable GIS
code. `src/lib` never imports app state. The base `Store` is a library tool; **concrete domain
stores, store instances, and every widget in this plan live in the app** under
`src/apps/app-demo-stores/`. Dependency points **app → lib**, never the reverse.

**Read the code, don't trust this document about APIs.** Three existing pieces are used
heavily and are deliberately *not* described here: the **checkbox-tree widget**
(`src/lib/widgets/checkbox-tree/`), the **OpenLayers layer factory**
(`src/lib/mapping/maps/openLayers/layerFactory.ts`), and the **table data classes** (under
`src/lib/…/data` — locate them). Before the task that first uses each, **open the source and
its tests** and work from the real signatures. Do not reimplement any of them, and do not
modify the checkbox-tree widget in this plan.

---

## Settled decisions (do not re-litigate)

### State keys are globally unique

This is the load-bearing decision that makes the two wirings possible. Every key name is
unique across all slices, so the single store's state is literally the union of the domain
slices, and one facade type describes both.

```ts
export interface LayerState { id: string; visible: boolean }

export interface LayersSlice {
  layersById: Record<string, LayerState>;
  layerOrder: string[];
  variableByLayerId: Record<string, string>;   // layer id -> active variable id
}

export interface UiSlice {
  expandedIds: string[];         // TOC group ids currently expanded
  expandedLegendIds: string[];   // legend sections currently open
  tableLayerId: string | null;
  tablePage: number;
}

export interface ViewportSlice {
  center: [number, number];
  zoom: number;
}

export type AppState = LayersSlice & UiSlice & ViewportSlice;
```

**State holds only what changes.** `label`, `fields`, `source`, `variables`, `category` stay in
the config module and are looked up by id. Nothing heavy, no class instances, no OL objects.

### The facade

```ts
export interface StoreLike<T extends object> { /* get, getAll, set, update, batch, subscribe, subscribeMany */ }
export interface AppStores {
  layers:   StoreLike<LayersSlice>;
  ui:       StoreLike<UiSlice>;
  viewport: StoreLike<ViewportSlice>;
}
```

Domain wiring passes three instances; single wiring passes the same `AppStore` three times.
Every widget takes `setup(stores: AppStores, …)` and calls e.g.
`stores.layers.subscribe('layersById', …)`.

### Widgets

Seven, all in `src/apps/app-demo-stores/src/widgets/`, one folder each, each a custom element
with a `setup(stores, …)` method: **toc**, **toggle-buttons**, **layers-summary**, **legend**,
**variable-switcher**, **table**, **share-app**.

Widgets build their own markup with **native** elements — `<select>` for comboboxes,
`<details>`/`<summary>` for legend sections. No new `src/lib/elements` work in this plan.

Subscribe in `connectedCallback`, `remove()` in `disconnectedCallback`, one-to-one. Widgets
never emit store events; they write through store action methods only.

### TOC derivation

The TOC is **derived from the layer configs**, not separately configured. Each layer config
carries an optional `category` string.

- **Group ids are synthesized:** `group:<slug(category)>` where `slug` lowercases, replaces
  each run of non-alphanumeric characters with `-`, and trims leading/trailing `-`. The
  namespace prevents collision with layer ids. **This rule is a URL contract** (group ids
  appear in `expandedIds` in the share link) — it must be deterministic and is covered by a
  unit test.
- **Group order** follows first appearance in the reversed layer order; layers within a group
  keep that same order.
- A layer **without** a `category` becomes a **root-level leaf**, so the tree has both grouped
  and ungrouped nodes.
- Group nodes and layer nodes are both `type: 'checkbox'`; the tree is built with
  `checkable: 'cascade'`. A group toggle therefore cascades to its layers.
- **Fresh load = all groups expanded.** A share link overrides with its `expandedIds`.

### Ordering

- **TOC and legend: reversed `layerOrder`** (top-drawn layer first).
- **toggle-buttons: config order.**

### The tree is built once, after state is known

The checkbox-tree sets initial expansion **per def at build** and has no public
`setExpanded`. So: decode the URL → build the stores → **then** build the tree, stamping
`expanded: true` on the restored group defs. Thereafter the wrapper accumulates the expanded
set itself from the tree's per-node toggle events. **Do not** modify the widget to add an
expansion API in this plan.

### Echo guards (three places, three different mechanisms)

Every store↔view loop in this app needs one, and `Object.is` alone is **not** sufficient — a
freshly built `[...ids]` array never matches by reference.

1. **TOC / legend expansion → store:** compare **contents** before writing; skip the write if
   unchanged.
2. **Map viewport ↔ store:** an `#applyingFromStore` flag in the map controller, plus a
   numeric tolerance on center/zoom comparison.
3. **Tree checked state:** structural — the widget's `setChecked` reflects without emitting,
   so store → widget is a dead end. Only user gestures emit. Nothing extra needed; do not add
   a flag here.

### Cascade writes are batched

A group toggle flips N layers. The TOC wrapper must apply them in **one `store.batch(…)`** so
the map reconciles once, not N times. This is the single most important thing the app proves.

---

# Phase 1 — The library store

## Task 1 — `deepFreeze` + dev guard

**Depends on:** nothing.
**Files:** `src/lib/core/freeze.ts`, `src/lib/core/freeze.test.ts`.
**Goal:** the dev-only immutability guard, correct on nested structures and cycles.

**Do:**
- Implement `deepFreeze<T>(o: T): T` per `docs/store-brief.md` §4: return early on non-objects,
  `null`, and already-frozen input (this both avoids re-walking shared subtrees **and** guards
  cycles); `Object.freeze`, then recurse over `Object.keys`.
- Export `guard` — `deepFreeze` in dev, identity in prod, selected once from
  `import.meta.env?.DEV ?? false`.
- Export **both** by name, so tests can exercise `deepFreeze` directly regardless of the
  ambient DEV flag.
- Add the documented limitation as a code comment: `Object.freeze` does not prevent mutation
  of `Map`/`Set` **contents**, and `Object.keys` does not traverse them — which is why state
  prefers plain object records.

**Tests:** freezes nested objects and arrays throughout; is idempotent on already-frozen
input; terminates on a cyclic object; leaves primitives and `null` untouched; a frozen object
throws on mutation (ESM is strict mode, so assignment throws rather than failing silently).
**Also assert `import.meta.env.DEV` is truthy under Vitest** — if it isn't, the store's freeze
test in Task 2 would pass vacuously; fix the Vitest config or the test setup here, not later.

**Done when:** `pnpm vitest run src/lib/core` green, `pnpm typecheck` no new errors,
`pnpm lint` clean.

## Task 2 — `Store<TState>` core: `get` / `getAll` / `set` / `update` / `subscribe`

**Depends on:** Task 1.
**Files:** `src/lib/core/store.ts`, `src/lib/core/store.test.ts`.
**Goal:** the store's non-batch surface, with reference-equality change detection.

**Do:**
- Implement `Store<TState extends object> extends Evented<ChangeEvents<TState>>` per
  `docs/store-brief.md` §5. Read `src/lib/core/evented.ts` first — **do not modify it**; its
  `emit`/`off` staying `protected` *is* the unidirectional-flow guarantee.
- `ChangeEvents<TState>` maps each key `K` to a `change:${K}` event carrying
  `{ value, previous }`. The template-literal mapped type may force `as any` on `emit` — keep
  those casts localized to that line and nowhere else.
- Constructor: copy each key of `initial` through `guard`.
- `get(key)` returns **the stored reference** — never a clone. `getAll()` is a shallow spread.
- `set(key, value)`: `Object.is` no-op check first, then `guard`, then assign, then emit.
  **No `structuredClone`, no deep copy, no `JSON.stringify` anywhere** — see §10 of the brief
  for why each is forbidden.
- `update(key, updater)` reads current and delegates to `set`.
- `subscribe(key, cb, { immediate })` — wraps `on`; `immediate` fires **synchronously** with
  `cb(current, current)` (`previous` is meaningless on the initial call).
- Leave `batch` and `subscribeMany` as stubs that throw — Task 3 fills them in.

**Tests:** `set` notifies with `(value, previous)`; `set` with the **same reference** is a
silent no-op; `set` with a **new reference of equal contents** *does* notify (this is the test
that proves we are reference-based, not content-based — the whole point of rejecting
`JSON.stringify`); `Subscription.remove()` stops further notifications;
`subscribe({ immediate: true })` fires synchronously with the current value; `update` applies
the updater and notifies; mutating a value returned by `get()` **throws** under the dev freeze;
`getAll()` returns every slice by the same reference.

**Done when:** suite green, typecheck no new errors, lint clean.

## Task 3 — `batch` + `subscribeMany`

**Depends on:** Task 2.
**Files:** `src/lib/core/store.ts`, `src/lib/core/store.test.ts`.
**Goal:** coalesced notification, with the batch bookkeeping exactly as specified.

**Do:**
- `batch(fn)`: increment depth, run `fn` in a `try`, and in the `finally` — when depth returns
  to 0 — swap out the pending map and emit each entry.
- Preserve these semantics **exactly**: state updates **immediately** on every `set`, even
  inside a batch; only *notification* defers. A key set multiple times in one batch emits
  **once**, with `previous` = the value from before the batch started and `value` = the last
  one set. The `Object.is` no-op check runs against live state, so redundant sets inside a
  batch are correctly skipped.
- `subscribeMany(keys, cb, { immediate })`: subscribe to each key, coalescing same-tick changes
  into a single `queueMicrotask` callback via a `scheduled` flag; `immediate` invokes `cb()`
  **synchronously**; the returned `Subscription.remove()` removes all inner subscriptions.

**Tests:** setting several different keys in one batch emits each affected key exactly once,
after the batch completes (assert count **and** order — insertion order of first `set`);
setting the same key repeatedly in a batch emits once with pre-batch `previous` and final
`value`; a redundant same-reference `set` inside a batch emits nothing; `subscribeMany`
coalesces multiple same-tick changes into one callback (await a microtask);
`subscribeMany({ immediate: true })` fires once synchronously on subscribe; `remove()` detaches
all keys.

**Done when:** suite green, typecheck no new errors, lint clean.

## Task 4 — Hardening: the edges the brief doesn't cover

**Depends on:** Task 3.
**Files:** `src/lib/core/store.ts`, `src/lib/core/store.test.ts`.
**Goal:** close two real defects and pin the surprising-but-intended behaviors before any app
code depends on them.

**Do:**
- **Fix: `subscribeMany` must not fire after `remove()`.** As specified, a change schedules a
  microtask that still runs even if the subscription is removed before the microtask executes
  — in a web component that means a callback against a torn-down element after
  `disconnectedCallback`. Add a `disposed` flag set by `remove()` and checked **inside** the
  microtask.
- **Subscriber error isolation.** A throwing handler currently kills the remaining handlers
  for that event and, inside a batch flush, the remaining **keys**. `Evented` is not to be
  modified, so wrap the store's emit/flush path: catch, `console.error`, continue.
- **Document, in a header comment:** `batch` is **per-instance** — there is no cross-store
  batching; `batch` has **no rollback** (if `fn` throws, state stays mutated and pending
  changes still flush); derivation is manual and key-coarse (no `computed` primitive);
  `subscribe` is synchronous while `subscribeMany` is a microtask.

**Tests:** change a key, `remove()` the `subscribeMany` subscription synchronously, await a
microtask, assert the callback never ran; a throwing subscriber does not prevent other
subscribers or other keys in a batch flush from being notified; nested `batch` flushes only at
depth 0; a `batch` whose `fn` throws still flushes and leaves state mutated (asserted as
intended behavior, not a bug); calling `set` from **inside** a subscriber behaves predictably
(pin whatever the implementation does — re-entrancy is allowed, but must be deterministic); a
subscriber added during an emit is not called for the in-flight event; `subscribe` is
synchronous while `subscribeMany` defers.

**Done when:** suite green, typecheck no new errors, lint clean. **Phase 1 is the gate for
everything that follows.**

---

# Phase 2 — App skeleton (ends at a stop point)

## Task 5 — App package with two entry points

**Depends on:** Task 4.
**Files:** `src/apps/app-demo-stores/` — `package.json`, `vite.config.ts`, `tsconfig.json`,
`index.html`, `index.single.html`, `src/main.ts`, `src/main.single.ts`; plus
`pnpm-workspace.yaml` if its globs don't already cover the path.
**Goal:** both builds serve and build, before there is anything in them.

**Do:**
- Create the package depending on the library via the workspace protocol. Import the lib as a
  **workspace package**, never by a relative path into `src/lib`. Match the sibling apps'
  config; copy their tsconfig/vite conventions rather than inventing new ones.
- Two entry points: `index.html` → `src/main.ts` (**domain stores**) and `index.single.html` →
  `src/main.single.ts` (**one `AppStore`**). Wire `build.rollupOptions.input` for both.
- Each `main` currently does nothing but render a heading naming its wiring, so the two are
  distinguishable in the browser.
- Add OpenLayers as a dependency of the app (not of the lib, unless the lib already declares it
  — check first).

**Tests:** none (build-config task).

**Done when:** `pnpm dev` serves both `/` and `/index.single.html` with the correct heading on
each; `pnpm build` emits both HTML entries; typecheck and lint clean.

## Task 6 — Folder skeleton and config placeholder

**Depends on:** Task 5.
**Files:** the tree below, under `src/apps/app-demo-stores/`.
**Goal:** every folder the plan will fill exists, with stubs that typecheck, so configs and
assets can be dropped in without touching structure.

**Do:** create this structure. Stub files export a named placeholder and compile; empty asset
folders get a `.gitkeep`.

```
src/apps/app-demo-stores/
  index.html
  index.single.html
  public/
    icons/                     # (empty — assets pasted at the stop point)
    testData/sourceLayers/     # (empty — assets pasted at the stop point)
  src/
    main.ts                    # composition root — domain wiring
    main.single.ts             # composition root — single-store wiring
    config/
      layers/                  # (empty — layer configs pasted at the stop point)
      types.ts                 # LayerConfig (placeholder, replaced in Task 8)
      index.ts                 # loader (stub, implemented in Task 8)
    state/
      keys.ts  facade.ts  stores.domain.ts  stores.single.ts  selectors.ts  tree-defs.ts
    map/
      controller.ts  registry.ts
    widgets/
      toc/  toggle-buttons/  layers-summary/  legend/
      variable-switcher/  table/  share-app/
    share/
      url.ts
```

- `config/types.ts` gets a **placeholder** `LayerConfig` to be replaced in Task 8 — enough to
  compile, with a comment saying it is provisional:
  `{ type: 'vector'; id: string; label: string; category?: string; source: { type: string; url: string }; visible: boolean; fields: { id: string; label: string }[]; default_variable: string; variables: unknown[] }`.

**Tests:** none (scaffolding task).

**Done when:** typecheck and lint clean with the stubs in place; both entries still serve.

## Task 7 — Blank map

**Depends on:** Task 6.
**Files:** `src/map/controller.ts`, both `main` files, app CSS.
**Goal:** an OpenLayers map fills the page in both builds, owning its own instance.

**Do:**
- `createMapController(target)` constructs the OL map with a single basemap and an initial
  view, and returns `{ map, destroy }`. **The map instance is owned solely by this module and
  never enters any store** — no OL objects in state, ever.
- Both `main` files call it. Layout: map fills the viewport, with a side panel region reserved
  for widgets (empty for now).

**Tests:** none (visual).

**Done when:** a basemap renders in both entries; `destroy()` tears down cleanly; typecheck and
lint clean.

> ## ⏸ STOP — hand-off point
>
> The operator pastes: **layer configs** into `src/config/layers/`, **icons** into
> `public/icons/`, and **test GeoJSON** into `public/testData/sourceLayers/`.
> Do not proceed past this point until those exist. Task 8 replaces the placeholder type with
> whatever the real configs actually are.

---

# Phase 3 — Config and state

## Task 8 — Real config types and loading

**Depends on:** the stop point (configs present).
**Files:** `src/config/types.ts`, `src/config/index.ts`, `src/config/config.test.ts`.
**Goal:** configs are typed, loaded, ordered, and validated enough to fail loudly.

**Do:**
- **Read the pasted config files first** and write `LayerConfig` to match them exactly. Model
  it as a **discriminated union on `type`** and the source as a union on `source.type`, but
  **implement only `type: 'vector'`** — other kinds (wfs, tile) are out of scope; an unknown
  `type` is skipped with a console warning, not a crash.
- The `category?: string` field is **additive to the operator's real config format** and drives
  only TOC grouping. Nothing else reads it. Layers without it are root-level leaves.
- Implement the loader in `config/index.ts` returning `LayerConfig[]` in a deterministic order.
  Static (`import.meta.glob`) or runtime `fetch` — either is fine; **prefer whichever is
  simpler**, and note the choice in a comment. If it is async, the loader returns a promise and
  the composition root awaits it before building stores.
- Export a `getLayerConfig(id)` lookup and a `getVariable(layerConfig, variableId)` helper —
  every widget resolves labels, fields, and legends through these, since **state holds only
  `{ id, visible }`**.
- Validate on load: unique ids, `default_variable` present in `variables`, non-empty `fields`.
  Throw with the offending id in the message.

**Tests:** loads all configs; ids unique; `getLayerConfig` returns the right record and
`undefined` for an unknown id; `getVariable` resolves the default and returns `undefined` for
an unknown variable; a fixture with a duplicate id throws; a fixture with a
`default_variable` not in `variables` throws; a fixture with an unsupported `type` is skipped
with a warning rather than throwing.

**Done when:** suite green, typecheck no new errors, lint clean.

## Task 9 — State keys and the facade (with the assignability spike)

**Depends on:** Task 8.
**Files:** `src/state/keys.ts`, `src/state/facade.ts`, `src/state/facade.test-d.ts` (or a
typecheck-only test).
**Goal:** one facade type that both wirings satisfy — proven now, not discovered later.

**Do:**
- Write `keys.ts` with `LayerState`, `LayersSlice`, `UiSlice`, `ViewportSlice`, `AppState`
  exactly as in **Settled decisions**. Add a comment stating the unique-key rule and why it
  exists (it is what makes the single-store wiring possible).
- Write `facade.ts` with `StoreLike<T>` (the six public methods) and `AppStores`.
- **Spike:** assert `Store<AppState>` is assignable to `StoreLike<LayersSlice>` — this relies
  on TypeScript's method bivariance, and it needs to be true **before** seven widgets are
  written against it. If it does not hold, write a small adapter object here and note it in a
  comment. Do not proceed to Task 10 until this compiles.

**Tests:** a type-level test asserting both `Store<AppState>` and a narrow
`Store<LayersSlice>` satisfy `StoreLike<LayersSlice>`.

**Done when:** typecheck clean, lint clean.

## Task 10 — Domain stores

**Depends on:** Task 9.
**Files:** `src/state/stores.domain.ts`, `src/state/stores.domain.test.ts`.
**Goal:** three `Store` subclasses with co-located actions, seeded from config.

**Do:**
- `LayersStore extends Store<LayersSlice>`, `UiStore extends Store<UiSlice>`,
  `ViewportStore extends Store<ViewportSlice>`.
- Actions as methods, each producing **new references** (`{ ...obj }`, `[...arr]`) — never
  mutate in place: `setVisible(id, visible)`, `toggleVisible(id)`,
  **`setVisibleMany(ids, visible)`** (one `batch` — the cascade path), `setVariable(id, varId)`,
  `setExpanded(ids)`, `setLegendExpanded(ids)`, `setTableLayer(id)`, `setPage(n)`,
  `setView({ center, zoom })` (one `batch`).
- A `createDomainStores(configs, initial?)` factory seeding `layersById` (`visible` from
  config), `layerOrder`, and `variableByLayerId` (from `default_variable`), with an optional
  partial override for restored share-link state. **Factory, not module singletons** — it keeps
  tests isolated.

**Tests:** seeding from configs produces the expected three slices; `toggleVisible` flips one
layer and leaves others by identical reference (structural sharing intact);
`setVisibleMany` emits `layersById` **exactly once** for N layers; `setView` emits `center` and
`zoom` once each; a no-op action (setting the value it already holds) emits nothing.

**Done when:** suite green, typecheck no new errors, lint clean.

## Task 11 — Single store + parity

**Depends on:** Task 10.
**Files:** `src/state/stores.single.ts`, `src/state/stores.single.test.ts`.
**Goal:** one store, the same actions, provably equivalent behavior.

**Do:**
- `AppStore extends Store<AppState>` with **the same action methods and the same key names** as
  Task 10.
- `createSingleStores(configs, initial?)` returns `{ layers: app, ui: app, viewport: app }` —
  the same instance three times — typed as `AppStores`.
- If the single store's action bodies would be copy-paste, extract the shared logic into plain
  functions taking a `StoreLike` and call them from both. **Only if** it's genuinely
  duplicated — do not build an abstraction speculatively.

**Tests:** run the **same assertions as Task 10** against `createSingleStores` (extract them
into a shared table-driven suite executed twice, once per factory). Assert
`createSingleStores` returns the identical instance for all three facade members. Any
divergence between the two suites is a **finding to record**, not a test to relax.

**Done when:** both suites green, typecheck no new errors, lint clean.

## Task 12 — Selectors and TOC def derivation

**Depends on:** Task 11.
**Files:** `src/state/selectors.ts`, `src/state/tree-defs.ts`, plus co-located tests.
**Goal:** every derived value the widgets need, as pure functions — no memoization.

**Do:**
- `selectors.ts` — plain functions over `AppStores`: `selectVisibleIds`, `selectHiddenIds`,
  `selectOrderedVisibleIds` (reversed `layerOrder`), `selectActiveVariable(layerId)`,
  `selectShareState`. Comment that memoized selector subscriptions are the **upgrade path** if
  a concrete need appears — not now.
- `tree-defs.ts` — `slugify(category)` and
  `buildTreeDefs(configs, { expandedIds }): TreeDef[]` implementing the **TOC derivation** rules
  in Settled decisions: `group:<slug>` ids, groups ordered by first appearance in **reversed**
  layer order, layers keeping that order within a group, uncategorized layers as root leaves,
  every node `type: 'checkbox'`, and `expanded: true` on groups listed in `expandedIds`.
  **Read the checkbox-tree source for the exact def shape** and match it.
- `slugify` must be deterministic and documented as a **URL contract**.

**Tests:** `slugify` handles spaces, punctuation, accents, casing, repeated separators, and
leading/trailing junk, with a table of cases pinned as the contract; group ids are namespaced
and cannot collide with a layer literally named like a group; group order follows reversed
layer order; an uncategorized layer lands at root; `expandedIds` stamps `expanded: true` on
exactly the named groups; an empty config list yields an empty def list.

**Done when:** suite green, typecheck no new errors, lint clean.

---

# Phase 4 — Map

## Task 13 — Layer registry and visibility reconciliation

**Depends on:** Task 12.
**Files:** `src/map/registry.ts`, `src/map/controller.ts`, `src/map/reconcile.test.ts`.
**Goal:** config → OL layers via the factory, driven by store state, touching only the diff.

**Do:**
- **Read `src/lib/mapping/maps/openLayers/layerFactory.ts` and its tests first.** Use it to
  build layers; do not write layer-construction code.
- `registry.ts` — an id → OL layer map owned by the controller. **Never in state.**
- On init, build every configured layer with its **active variable from the store**
  (`variableByLayerId`), register it, and add it to the map.
- `reconcileVisibility(map, registry, visibleIds)` — applies visibility to the diff only, in
  reversed-`layerOrder` z-order. **Layers stay attached regardless of visibility**, because the
  table queries a layer's data whether or not it is shown.
- Wire it: `stores.layers.subscribeMany(['layersById','layerOrder'], reconcile, { immediate: true })`.
  `immediate` covers "state already populated at wire-up"; the subscription covers later
  changes — one mechanism, both orders.
- Instrument the reconcile function with a **call counter** exported for tests (Task 18 and
  Task 27 assert against it).
- Tear down the subscription in the controller's `destroy()`.

**Tests:** with a fake map/registry, reconcile applies only the changed layers; a no-op change
touches nothing; toggling one layer of ten touches exactly one; z-order follows reversed
`layerOrder`; `{ immediate: true }` paints current state at wire-up; `destroy()` removes the
subscription.

**Done when:** suite green, layers visibly appear/disappear when store state is changed from
the console, typecheck and lint clean.

## Task 14 — Variable → restyle

**Depends on:** Task 13.
**Files:** `src/map/controller.ts`, `src/map/restyle.test.ts`.
**Goal:** changing a layer's active variable restyles the existing layer.

**Do:**
- Subscribe to `variableByLayerId`; on change, **restyle the existing OL layer in place** for
  each layer whose variable actually changed — do not rebuild or re-add the layer, and do not
  refetch its source. Use the factory's styling path (read it to find out how a variable is
  applied).
- Diff old vs new records so an unrelated change to the record touches nothing.

**Tests:** changing one layer's variable restyles exactly that layer; an unchanged record
restyles nothing; a variable id not present in the layer's config is ignored with a warning
rather than throwing.

**Done when:** suite green, a variable change visibly restyles the map, typecheck and lint
clean.

## Task 15 — Viewport two-way with echo guard

**Depends on:** Task 14.
**Files:** `src/map/controller.ts`, `src/map/viewport.test.ts`.
**Goal:** map ↔ store in both directions without a feedback loop.

**Do:**
- **map → store:** on `moveend`, write `center` and `zoom` via `setView` (one `batch`).
- **store → map:** subscribe to both keys; apply to the OL view.
- **Echo guard:** an `#applyingFromStore` flag set around the programmatic apply, plus a
  numeric tolerance when comparing center/zoom, so float drift doesn't ping-pong. Without this
  the two directions feed each other.

**Tests:** a store write applies to the map and does **not** re-enter the store write path; a
map move writes once to the store; a round-trip settles — simulate 50 alternating updates and
assert the write count stays linear, not runaway; sub-tolerance drift is treated as no change.

**Done when:** suite green, panning and zooming by hand shows no jitter or runaway, typecheck
and lint clean.

---

# Phase 5 — Widgets

Every widget task: own folder, custom element, `setup(stores: AppStores, …)`, subscribe in
`connectedCallback`, `remove()` in `disconnectedCallback` one-to-one, native elements only,
light DOM, own CSS file. Each ships an integration test that mounts it against a **real**
store from Task 10 and asserts render + write-back both ways. Build in this order — each raises
the pressure.

## Task 16 — `toggle-buttons`

**Depends on:** Task 15.
**Files:** `src/widgets/toggle-buttons/` + test.
**Goal:** the simplest reader/writer — the baseline round trip.

**Do:** one button per layer in **config order**, labeled from config; pressed state reflects
`layersById[id].visible` (use `aria-pressed`). Click → `stores.layers.toggleVisible(id)`.
Subscribe to `layersById` with `{ immediate: true }`.

**Tests:** renders one button per config layer in config order; initial pressed state matches
seeded config; a store change updates the button without a click; a click writes to the store
exactly once; disconnect removes the subscription (assert no update after a post-disconnect
store change).

**Done when:** suite green, typecheck and lint clean.

## Task 17 — `layers-summary`

**Depends on:** Task 16.
**Files:** `src/widgets/layers-summary/` + test.
**Goal:** a pure reader — proves two decoupled widgets stay in sync through the store alone.

**Do:** two sections, **Visible** and **Hidden**, each listing layer labels (from config, by
id) in **reversed `layerOrder`**. Subscribe to `layersById` and `layerOrder`. Writes nothing,
ever.

**Tests:** partitions correctly on mount; a layer toggled **via a toggle-buttons click** moves
between sections (mount both widgets against the same store — this is the point of the test);
empty sections render an explicit empty state; reversed order asserted.

**Done when:** suite green, typecheck and lint clean.

## Task 18 — `toc`: build and checked two-way

**Depends on:** Task 17.
**Files:** `src/widgets/toc/` + test.
**Goal:** the cascade path, batched.

**Do:**
- **Read the checkbox-tree source first** for `build` / `setChecked` / `getChecked` and the
  change event's real name and payload shape. Do not modify the widget.
- The wrapper builds the tree **once, in `connectedCallback`**, from
  `buildTreeDefs(configs, { expandedIds: stores.ui.get('expandedIds') })` with
  `checkable: 'cascade'`, and a `getLabel` that resolves the layer label from config (and the
  category string for group nodes).
- **store → tree:** subscribe to `layersById` and call `setChecked(visibleIds)`. This reflects
  without emitting, so it is a dead end — **do not add a guard flag here.**
- **tree → store:** on the change event, take the checked ids and write them through **one
  `stores.layers.setVisibleMany(...)` batch**. Never one `set` per layer.
- Do not read the store in a field initializer — construction can precede store population.
  Build and subscribe in `connectedCallback`.

**Tests:** builds groups and root-level leaves per the derivation rules; initial checked set
matches seeded visibility; checking a **group** cascades to its layers and produces **exactly
one** `layersById` emission (assert emit count — this is the batch proof); a store-side
visibility change reflects into the tree **without** re-emitting to the store (assert the store
write count is unchanged); toggling a single leaf writes once; a group with all layers checked
reads back as checked, one unchecked reads as mixed.

**Done when:** suite green, typecheck and lint clean.

## Task 19 — `toc`: expansion mirroring

**Depends on:** Task 18.
**Files:** `src/widgets/toc/` + test.
**Goal:** view-state mirrored to the store, loop-free, survives a remount.

**Do:**
- Listen for the tree's per-node toggle event, **accumulate** the expanded group-id set in the
  wrapper (the widget exposes no `getExpanded`), and write it to `stores.ui.setExpanded(...)`.
- **Echo guard: compare contents before writing.** A freshly built array never matches by
  reference, so `Object.is` alone will not stop the loop.
- On reconnect, the tree is rebuilt from `expandedIds`, so expansion survives a DOM move — the
  same path that restores it from a share link.
- Write only on genuine user gestures, not on programmatic reflection.

**Tests:** expanding a group writes the id to the store once; collapsing removes it; writing an
identical set again produces **no** store emission; detach and reattach the element and assert
expansion is restored from the store; assert no unbounded write loop (pin the store write
count across a store→view→store round trip).

**Done when:** suite green, typecheck and lint clean.

## Task 20 — `legend`

**Depends on:** Task 19.
**Files:** `src/widgets/legend/` + test.
**Goal:** a section per **visible** layer, reflecting the active variable, with store-backed
open state.

**Do:**
- One `<details>`/`<summary>` section per **visible** layer, in **reversed `layerOrder`**.
- Section header: the **first legend item's symbol** as the icon (image when the item has an
  icon path, colored swatch when it has a color), the title, and the native disclosure arrow.
- **Title** = the active variable's `legend.label`, falling back to the layer's `label` when
  the legend has no label of its own.
- Body: one row per legend item — symbol (icon or swatch) + item label.
- Content comes from the layer's **active variable** (`variableByLayerId`), resolved through
  the config helpers from Task 8.
- **Open state is store-backed** (`expandedLegendIds`) with the same **content-comparison echo
  guard** as Task 19. A layer hidden and re-shown keeps its section open.
- Subscribe to `layersById`, `layerOrder`, `variableByLayerId`, `expandedLegendIds`.

**Tests:** renders a section only for visible layers, in reversed order; hiding a layer removes
its section and re-showing restores it **with its open state intact**; changing a layer's
variable swaps the legend content and the header icon; a variable whose legend has no `label`
falls back to the layer label; icon-based and color-based items both render; opening a section
writes once and an identical write emits nothing.

**Done when:** suite green, typecheck and lint clean.

## Task 21 — `variable-switcher`

**Depends on:** Task 20.
**Files:** `src/widgets/variable-switcher/` + test.
**Goal:** two comboboxes; a second writer into the styling path.

**Do:**
- Two native `<select>`s: **layer** (all configured layers, config order) and **variable** (the
  selected layer's `variables`, labeled by the variable's legend label with the variable id as
  fallback).
- **The selected layer is local widget state**, not store state — only the chosen variable is
  shared. This is a deliberate contrast with the table, whose selection *is* in the store.
- Changing the variable → `stores.layers.setVariable(layerId, variableId)`.
- The variable select reflects `variableByLayerId` for the currently selected layer, including
  changes made elsewhere (e.g. a restored share link).

**Tests:** the variable list repopulates when the layer selection changes; the current value
reflects the store on mount and on external change; changing it writes once; the local layer
selection is **not** written to any store; a layer with a single variable still renders
correctly.

**Done when:** suite green, typecheck and lint clean.

## Task 22 — `table`: combobox and columns

**Depends on:** Task 21.
**Files:** `src/widgets/table/` + test.
**Goal:** structure first — selection in the store, columns from config. No data yet.

**Do:**
- A native `<select>` bound to `stores.ui.tableLayerId` (in the store because it is in the
  share link), defaulting to the first configured layer when null.
- Columns from the selected layer's `fields` (`id` → `label`), resolved through config.
- Render an empty body with a placeholder row; pagination controls present but inert.
- Changing the layer resets the page: `tableLayerId` and `tablePage` written in **one batch**.

**Tests:** columns match the selected layer's fields, in config order; changing the layer
swaps the columns; changing the layer emits `tableLayerId` and `tablePage` **once each**
(batch proof); an external store change to `tableLayerId` updates the select; a null
`tableLayerId` falls back to the first layer without writing.

**Done when:** suite green, typecheck and lint clean.

## Task 23 — `table`: rows and pagination

**Depends on:** Task 22.
**Files:** `src/widgets/table/` + test.
**Goal:** real data through the lib's data classes, paged from the store.

**Do:**
- **Locate and read the table data classes under `src/lib` and their tests first.** Use them to
  query the layer's server; do not write fetch code and do not reimplement paging that they
  already do.
- The table queries the **selected layer's** data regardless of that layer's visibility.
- Rows come from the data class for the current `tablePage`; page size is a module constant.
- **Heavy data never enters the store** — rows live in the widget (or the data class's own
  cache). The store holds only `tableLayerId` and `tablePage`.
- **Stale-response guard:** an incrementing token; a response for a superseded
  layer/page request is dropped. Fast clicking through pages or layers must not paint stale
  rows over fresh ones.
- Render loading and error states, and disable the pager at the bounds.

**Tests:** rows render for the selected layer and page; changing the page fetches once and
re-renders; changing the layer resets to page 1 and issues **one** fetch, not two; an
out-of-order response for a superseded request is dropped (resolve an earlier promise after a
later one and assert the later result stands); an error renders the error state without
throwing; **no row data appears in any store slice** (assert `getAll()` shape).

**Done when:** suite green, real rows visible in the browser for both a geojson and a
server-backed layer, typecheck and lint clean.

---

# Phase 6 — Share link

## Task 24 — URL encode / decode

**Depends on:** Task 23.
**Files:** `src/share/url.ts`, `src/share/url.test.ts`.
**Goal:** pure, versioned, readable, total — never throws.

**Do:**
- **Readable versioned params**, not opaque base64 — this is a debugging app:
  `?v=1&vis=a,b&exp=group:base-maps&leg=a&var=a:tier,b:province&tl=points&tp=3&c=-71.21,46.81&z=8`
- `encodeShareState(state): string` and `decodeShareState(search): Partial<AppState>`, both
  pure functions with no store or DOM access.
- **Decoding is total:** unknown layer ids dropped, malformed numbers ignored, missing params
  omitted, wrong version ignored entirely. It returns a partial to merge over config-seeded
  defaults and **never throws**.
- Round numeric center/zoom to a fixed precision so the URL is stable across identical views.

**Tests:** round-trip of a full state; each param independently omitted still decodes;
unknown layer ids in `vis`/`var` are dropped; a `var` entry naming a variable the layer lacks
is dropped; garbage input (`?v=1&z=banana&c=x`) returns a sane partial rather than throwing; a
future version string decodes to empty; encoding is stable — the same state twice produces the
identical string.

**Done when:** suite green, typecheck and lint clean.

## Task 25 — `share-app` widget

**Depends on:** Task 24.
**Files:** `src/widgets/share-app/` + test.
**Goal:** capture the current state on click, publish it, and report honestly.

**Do:**
- A single button plus a short status line (`role="status"`).
- On click: read state **synchronously** via the Task 12 selectors. `subscribeMany` is a
  microtask, so do **not** rely on subscribers having run — read the store directly.
- Encode, write to the address bar with `history.replaceState` (never a navigation), and copy
  with `navigator.clipboard.writeText`.
- Report the outcome in the status line. **Clipboard access can be denied** — a rejection or
  missing API shows "link is in the address bar, copy failed" rather than a silent failure or a
  thrown error.

**Tests:** click produces the expected URL for a known state; the address bar is updated via
`replaceState` and the page does not navigate; a rejected clipboard promise still updates the
URL and reports the partial failure; a missing `navigator.clipboard` degrades the same way; the
widget writes nothing to any store.

**Done when:** suite green, clicking in the browser yields a working link, typecheck and lint
clean.

## Task 26 — Restore on load, in both composition roots

**Depends on:** Task 25.
**Files:** `src/main.ts`, `src/main.single.ts`.
**Goal:** a shared link restores fully, in both wirings, with no cross-store batching needed.

**Do:** the composition root's order is **load config → decode URL → create stores seeded with
the restored partial → create the map controller → create widgets and `setup(stores)` each**.

Restoring **before** wiring is what makes the missing cross-store `batch` a non-issue — nothing
is subscribed yet, so there is nothing to coalesce. **Do not** build a `batchAcross` helper.
If restoring before wiring proves impossible for some case, that is a **finding for Task 27**,
not a licence to add the helper.

Both roots differ **only** in which factory they call. Widget construction and `setup` calls
must be a shared function used by both — if the two roots diverge, the facade has failed.

**Tests:** an integration test per root that boots with a crafted URL and asserts the resulting
store state matches; booting with **no** URL params yields config defaults; both roots produce
**identical** state from the same URL.

**Done when:** both suites green, a link generated in one build restores correctly in the
other, typecheck and lint clean.

---

# Phase 7 — The verdict

## Task 27 — Stress pass and findings

**Depends on:** every previous task.
**Files:** `src/app.stress.test.ts`, and edits to `docs/store-brief.md`.
**Goal:** answer the question the app exists to answer, in writing.

**Do:** run each check, then write findings back into `docs/store-brief.md` (§9 tests, §10
forbidden patterns) — anything the app taught us belongs in the brief, including things that
worked and should be recorded as settled.

**Checks:**
1. **Widget code is identical across the two wirings** — grep for any conditional on wiring.
   A hit is a finding, not a bug to paper over.
2. **No echo loops** — a scripted pass: pan and zoom repeatedly, cascade-toggle every group,
   expand/collapse the TOC and every legend section, switch variables. Assert store write
   counts stay linear.
3. **One reconcile per batched change** — assert the Task 13 counter increments exactly once
   for a group cascade covering N layers.
4. **Remount every widget** — detach and reattach each of the seven; assert no leaked
   subscriptions and **no post-disconnect callbacks** (this is what the Task 4 fix exists for).
5. **Dev freeze never throws in normal operation.** If it does, something mutates state in
   place — that is a bug in the app, not a problem with the freeze.
6. **No heavy data in state** — assert `getAll()` holds only ids and light metadata after
   loading every layer and paging the table.
7. **Store↔OL boundary** — confirm no frozen state object is handed to OpenLayers or the
   factory in a way that OL then mutates, and that config objects are copied before entering
   state (freezing a config module object would freeze the module singleton for every reader).

**Done when:** all checks pass or are written up as explicit findings, `docs/store-brief.md`
is updated, full suite green, typecheck and lint clean.

---

## Verification (every task)

- `pnpm vitest run <the task's path>` — that task's tests **and all prior tests** pass.
- `pnpm typecheck` — no new errors over baseline.
- `pnpm lint` on changed files.
- Commit per task.

## Out of scope — do NOT

- **Do not modify the checkbox-tree widget.** No `setExpanded`/`getExpanded` API in this plan,
  even though the expansion-restore rule exists because of its absence. That is a separate,
  deliberate follow-up.
- **Do not implement non-vector layer kinds** (wfs, tile). Type the union, implement `vector`,
  skip the rest with a warning.
- **Do not add a `computed` primitive, memoized selectors, or a signals layer.** Selectors are
  plain functions; derivation is manual and key-coarse by design.
- **Do not add cross-store batching** (`batchAcross`). Restore-before-wiring removes the need.
- **Do not put an OL map, layer, source, or any class instance, DOM node, or function into any
  store.** Ids and light metadata only.
- **No `structuredClone` or deep copy in `get`/`set`; no `JSON.stringify` for equality.**
- **No store imports inside `src/lib` widgets**, and no app→lib dependency inversion.
- **Do not use module singletons for stores** — factories only, so tests stay isolated and the
  two-wiring comparison is honest.
- **Do not build new `src/lib/elements`.** Widgets use native elements.