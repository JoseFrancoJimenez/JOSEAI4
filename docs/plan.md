# Architecture — Mini UI / Widget / Tools Library

Reference for building anything in this repo. `CLAUDE.md` holds the short rules and points here for detail. This file is read on demand — when a task needs it.

The library is a set of **self-contained** front-end building blocks — **UI elements**, **widgets**, and **tools** (base store, event emitter) — consumed by multiple apps (some GIS, some not). The repo also hosts throwaway prototypes to test ideas. Nothing in the library may depend on app state; wiring to global state happens **around** a widget, never inside it.

**Stack:** Vite + TypeScript, **vanilla** Web Components — no UI frameworks, no JSX. **Be pragmatic: build the minimum that works;** add abstraction only when a concrete need forces it, never speculatively.

---

## 1. Two kinds of building block

Distinguished by one question: **does it hold state and decide something, or does it only render what it's handed?**

- **UI element (dumb)** — pure View. Contract is entirely **props-down / events-up**: a value comes in by property/attribute, a change goes out by `CustomEvent`. Remembers nothing, derives nothing, decides nothing. E.g. `ui-button`, `ui-checkbox`, `ui-slider`, `ui-toggle`.
- **Widget (smart)** — has its own **internal state and/or logic**. E.g. a datepicker (visible month, selection, calendar rules), a tree/TOC (expanded set, tree structure).

**No Shadow DOM.** Every custom element — element or widget — renders into **light DOM**.

A widget typically **composes UI elements inside it**: the widget holds the intelligence; the leaf pieces that only paint are UI elements. Consumer-supplied content is passed in (e.g. a render callback), not hard-coded.

**Classification test:** strip away all external input, then ask — *is there anything left to remember or decide?* Nothing → UI element. Something → widget. The name doesn't decide it: a date**picker** is a widget (selection + validation); a date**display** that only formats a passed-in date is a UI element.

**Library widgets never touch a global store.** A widget with its own state uses **local** state (a small listener array, or its own `Evented` subclass). Connecting a widget to app state is an app-level concern (§4).

---

## 2. MVVM and the complexity spectrum

**The pattern is MVVM.** Its topology: **View ↔ ViewModel → Model**. The View sends commands to the ViewModel *and* listens to it — both directions to the same place. The View does **not** touch the Model directly. Notification lives in the **ViewModel**. The ViewModel is a **plain class** (not an `HTMLElement`), so it is testable **without a DOM** — that is the whole reason it exists.

**Materialize MVVM by complexity — do not build all layers up front:**

1. **View only** — a UI element. No ViewModel, no Model.
2. **View with view-state + commands inlined in the element** (no separate ViewModel), optionally holding a **Model it reads directly**. This is the pragmatic simple-widget form (tabs, accordion, etc). The view-state (e.g. an expanded `Set`) lives in the element because it's light.
3. **View + extracted ViewModel + Model** — the full form. Extract the ViewModel when presentation logic is non-trivial *and* you need DOM-free tests. Once extracted, the **ViewModel becomes the Model's sole consumer** and the View stops reading the Model directly.

**The rule:** extract a layer when it **earns its place** — never preventively. **Testing is the tiebreaker:** if extracting makes non-trivial logic testable without a DOM, lean toward extracting; if the logic is trivial (formatting a value, holding one flag), don't — an empty pass-through layer is ceremony.

**Add a Model** when there is **non-trivial domain logic** — rules that would be true with no UI at all (validation, calculations, constraints, tree/graph structure). A Model is pure and trivially unit-testable; that is a strong reason to separate it. A datepicker's calendar rules or a TOC's tree/cycle/depth logic belong in a Model. Incrementing a number does not.

---

## 3. The store tool (app-level state)

The base **`Store<TState>`** is a library tool but is meant for **application global state**. Summary (full spec: `docs/store-brief.md`):

- **Pub/sub by first-level key**, built on `Evented`. Each key `K` → a `change:${K}` event carrying `{ value, previous }`.
- **Immutability by convention + dev-only deep freeze** (stripped in prod). **No cloning** on read or write.
- Change detection is **`Object.is` on references** — never `JSON.stringify`.
- **Plain serializable data only**; prefer object **records** over `Map`/`Set`. No class instances, DOM nodes, functions, or map instances in state.
- **Heavy data stays out**: ids + light metadata in state; heavy payloads in a service cache keyed by id.
- API: `get`, `getAll`, `set`, `update`, `batch`, `subscribe`, `subscribeMany`, with an `{ immediate }` option. **Domain stores, not one mega-store.**

**Critical separation:** the base `Store` is for **app global state**. **Library widgets do not use it** — they use their own local state. Concrete **domain stores** (an app's `layers`, `viewport`, `cart`) and any store instances live in an **app under `src/apps/`**, not in `src/lib`.

---

## 4. Wiring a widget to a store (app-level, for mini-apps)

When a prototype/app needs a library widget driven by global state, **wrap it** in an app-level web component.

- **Composition, not inheritance**, to connect state. (Inheritance couples you to the widget's internals.) Rule: **compose to connect state; inherit only to specialize behavior.**
- The wrapper **owns the domain model** and **derives it from the store**. It injects a **read-only view** of the model into the library widget.
- **Single writer, guaranteed by types.** Split the model's surface into a readable interface (roots/get/iterate/subscribe) and a writable one (adds add/remove/move/clear). The widget's `setup` takes the **readable** interface, so it cannot mutate domain. Only the wrapper holds the writable model.
- **Data flow:** `store → model` (the wrapper is the **sole writer**, reconciling from the store) and `view → store` (mirror view-state such as expansion back; the store's `Object.is` guard breaks any echo).

**Lifecycle (the wrapper is a custom element):**

- **Do not read the store in a field initializer** (`#model = new Model(derive(store...))`). Field init runs at element **construction**, which can precede store population → you build an empty tree. Instead: **construct the model empty; populate it in `connectedCallback` via the same sync path used for all updates.**
- Cover both orders with one mechanism: `subscribeMany([...], sync, { immediate: true })`. `immediate` runs the sync once now (data already in the store at mount), and the subscription fires on every later change (store populated after mount).
- Clean up subscriptions in `disconnectedCallback`, matched one-to-one per connect. Create the model **once** (field), (re)subscribe **per connect**.
- Optionally hydrate view-state from the store on (re)connect so it survives a DOM move/remount.

**Dependency points app → library only.** The wrapper imports the library widget, never the reverse. The wrapper lives in an app under `src/apps/`.

---

## 5. Testing

Target a **pyramid**:

- **Base (many, fast, no DOM):** domain **Models** (pure logic) and **ViewModels** (plain classes). Unit-tested by instantiating and asserting.
- **Middle (fewer, with DOM):** **widgets/elements** as custom elements. Integration-tested: mount, interact, assert rendered output and dispatched events.
- **Tool:** the base **store** — pin its behaviors: reference-equality no-op (same reference → no notify), notify on a new equal-content reference (proves reference-based, not content-based), `batch` coalescing (each key once), `subscribeMany` coalescing, dev freeze throwing on mutation, `immediate` firing synchronously.

**What to test per layer:**

- UI element: property in → rendered output; interaction → correct `CustomEvent`.
- Widget with a Model: unit-test the Model standalone (the big win); integration-test the element.
- Widget with a ViewModel: unit-test the ViewModel with a mock/fake model (no DOM); thin integration test on the element.
- App wrapper: with a fake readable model / fake store, assert store→model and view→store wiring.

Run and iterate on tests in the **terminal**, not in chat.

---

## 6. Repo layout — pnpm monorepo

The library and the apps live in **one pnpm workspace**, as separate packages under `src/`. Apps depend on the library via the workspace protocol.

```
pnpm-workspace.yaml    # workspace globs: src/lib, src/apps/*
src/
  lib/                 # the library package — self-contained, no app state
    core/              # tools: evented.ts, store.ts, freeze.ts
    elements/          # UI elements (ui-button, ui-checkbox, ...)
    widgets/           # widgets + their local models (e.g. widgets/toc/)
  apps/
    <app>/             # an individual app (Vite) — imports the lib as a workspace dep
    sandbox/           # a throwaway app for testing ideas (disposable)
docs/
  plan.md              # this file
  store-brief.md       # base store + example stores spec
  toc-brief.md         # TOC widget spec
CLAUDE.md              # short rules (auto-loaded)
human.md               # operator guide (not for the agent)
```

- Tests co-located as `*.test.ts` next to source.
- `src/lib` holds **only** self-contained library code. The base `Store` is a library tool; **concrete domain stores and app-level wrappers live in an app under `src/apps/`**, never in `src/lib`.
- Apps import the library as a **workspace package** (e.g. `import { Store } from '@<scope>/lib/core'`), never by a relative path into `src/lib`. Dependency points **app → lib** only.
- Keep experiment apps (e.g. `src/apps/sandbox`) disposable — one folder per idea.
