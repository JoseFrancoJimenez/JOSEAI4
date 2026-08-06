# App state — the store, and wiring a widget to it

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.**

Read this when a task touches application state. Building a component does not — components never import a store.

> **Status:** the base `Store` is built. This file is how to *use* it and what constrains code around it. The full API specification lives in `store-brief.md`.

## 1. What it is and where it lives

`Store<TState>` is a library **tool** for **application global state**, built on `Evented`. Pub/sub by first-level key: each key `K` emits `change:${K}` carrying `{ value, previous }`.

- The base `Store` lives in `src/lib/core/`.
- **Concrete domain stores** (an app's `layers`, `viewport`, `cart`) and any store **instances** live in an app under `src/apps/` — never in `src/lib`.
- **Domain stores, not one mega-store.**

## 2. The boundary rules

These constrain code that is not itself the store, so they matter most:

- **Library widgets never use it.** A widget with state uses local state — a small listener array or its own `Evented` subclass. A library widget must not import, reference, or know about a store.
- **Wiring a widget to a store is app-level**, done by a wrapper (§4), never inside the widget.
- **Never add origin/source filtering** to state notifications. It breaks unidirectional flow. Loop safety comes from the structure instead: components reflect state without emitting, and only user gestures emit — so there is no echo to filter.

## 3. Rules for state itself

- **Plain serializable data only.** Prefer object **records** over `Map`/`Set`. No class instances, DOM nodes, functions, or map instances in state.
- **Immutability by convention**, backed by a dev-only deep freeze (stripped in prod). **No cloning** on read or write.
- Change detection is **`Object.is` on references** — never `JSON.stringify`.
- **Heavy data stays out:** ids and light metadata in state; heavy payloads in a service cache keyed by id.

API surface: `get`, `getAll`, `set`, `update`, `batch`, `subscribe`, `subscribeMany`, each subscription accepting an `{ immediate }` option. See `store-brief.md` for signatures and semantics.

## 4. Wiring a widget to a store

When an app needs a library widget driven by global state, **wrap it** in an app-level custom element.

- **Composition, not inheritance.** Inheritance couples the app to the widget's internals. Rule: **compose to connect state; inherit only to specialize behavior.**
- The wrapper **owns the domain model** and **derives it from the store**, injecting a **read-only view** into the widget.
- **Single writer, guaranteed by types.** Split the model's surface into a readable interface (get/iterate/subscribe) and a writable one (add/remove/update/clear). The widget receives the **readable** interface, so it cannot mutate domain. Only the wrapper holds the writable model.
- **Data flow:** `store → model` (the wrapper is the sole writer, reconciling from the store) and `view → store` (mirror view-state back; the store's `Object.is` guard breaks any echo).

**Lifecycle — the wrapper is a custom element, so component rules apply too** (see the `web-components` skill). Two additions specific to store wiring:

- **Do not read the store in a field initializer** (`#model = new Model(derive(store...))`). Field init runs at element **construction**, which can precede store population → an empty model. Instead: **construct the model empty; populate it via the same sync path used for every later update.**
- **Cover both orders with one mechanism:** `subscribeMany([...], sync, { immediate: true })`. `immediate` runs the sync once now (data already present at mount); the subscription fires on every later change (store populated after mount). Create the model **once**; (re)subscribe **per connect**; unsubscribe on teardown, matched one-to-one.

Optionally hydrate view-state from the store on reconnect so it survives a DOM move.

```ts
// app wrapper — the ONLY place that knows a store exists
connectedCallback() {
  this.#unsub = store.subscribeMany(['selection'], () => {
    this.#list.setSelected(store.get('selection'));   // store → widget: a command, which does not emit
  }, { immediate: true });

  this.#list.addEventListener('widget-list:select', (e) => {
    store.set('selection', e.detail.ids);             // widget → store: the wrapper is the sole writer
  }, { signal: this.#controller.signal });
}
```

Loop safety is structural: a command reflects without emitting, so `store → widget` is a dead end; only a user gesture emits, and the store's `Object.is` guard absorbs a write it already holds. An app with no store wires nothing and the widget still works.

**Dependency points app → library only.** The wrapper imports the widget, never the reverse, and lives under `src/apps/`.

## 5. Tests that pin the store

The store's behaviours are pinned once, in its own suite:

- Same reference in → no notification (reference-equality no-op).
- A new reference with equal content → notifies (proves reference-based, not content-based).
- `batch` coalesces — each key notified once.
- `subscribeMany` coalesces.
- The dev freeze throws on mutation.
- `{ immediate: true }` fires synchronously.

For a wrapper: with a fake readable model and a fake store, assert the `store → model` and `view → store` wiring — and nothing else.
