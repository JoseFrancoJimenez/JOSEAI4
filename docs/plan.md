# Architecture — Mini UI / Widget / Tools Library

How the pieces are divided and layered. `CLAUDE.md` holds the short rules and points here for detail. This file is read on demand — when a task needs it.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively. Pragmatic is not careless: the code must be easy to read, easy to understand, easy to maintain, easy to scale and easy to test.**

The library is a set of **self-contained** front-end building blocks — **UI elements**, **widgets**, and **tools** (base store, event emitter, region helper) — consumed by multiple apps (some GIS, some not). The repo also hosts throwaway prototypes to test ideas. Nothing in the library may depend on app state; wiring to global state happens **around** a widget, never inside it (this applies to library widgets only, not to application widgets).

Scope note: this file covers *what goes where and in how many layers*. Authoring mechanics (lifecycle, `setup()`, content regions, events, `html()`, CSS, accessibility, test recipes) live in the `web-components` skill. App state and store wiring live in `docs/store.md`; the region helper's own spec lives in `docs/regions.md`.

---

## 1. Two kinds of building block

Distinguished by one question: **does it hold state and decide something, or does it only render what it's handed?**

- **UI element (dumb)** — pure View. Contract is entirely **props-down / events-up**: a value comes in by property/attribute, a change goes out by an event — a native one where the platform already provides it, otherwise a `CustomEvent`. Remembers nothing, derives nothing, decides nothing. E.g. `ui-button`, `ui-checkbox`, `ui-slider`, `ui-toggle`.
- **Widget (smart)** — has its own **internal state and/or logic**. E.g. a datepicker (visible month, selection, calendar rules), an autocomplete (query, filtering, highlighted match).

**Classification test:** strip away all external input, then ask — *is there anything left to remember or decide?* Nothing → UI element. Something → widget. The name doesn't decide it: a date**picker** is a widget (selection + validation); a date**display** that only formats a passed-in date is a UI element.

A widget typically **composes UI elements inside it**: the widget holds the intelligence; the leaf pieces that only paint are UI elements. Consumer-supplied content is passed in — through declared **content regions** for fixed areas, or a **render callback** for repeated per-item content (see the `web-components` skill) — never hard-coded. Regions are opt-in: an element configurable by attributes alone declares none.

**Library widgets never touch a global store.** A widget with its own state uses **local** state (a small listener array, or its own `Evented` subclass). Connecting a widget to app state is an app-level concern — see `docs/store.md`.

## 2. MVVM and the complexity spectrum

**The pattern is MVVM.** Its topology: **View ↔ ViewModel → Model**. The View sends commands to the ViewModel *and* listens to it — both directions to the same place. The View does **not** touch the Model directly. Notification lives in the **ViewModel**. The ViewModel is a **plain class** (not an `HTMLElement`), so it is testable **without a DOM** — that is the whole reason it exists.

**Materialize MVVM by complexity — do not build all layers up front:**

1. **View only** — a UI element. No ViewModel, no Model.
2. **View with view-state + commands inlined in the element** (no separate ViewModel), optionally holding a **Model it reads directly**. This is the pragmatic simple-widget form (tabs, accordion, etc). The view-state (e.g. an expanded `Set`) lives in the element because it's light.
3. **View + extracted ViewModel + Model** — the full form. Extract the ViewModel when presentation logic is non-trivial *and* you need DOM-free tests. Once extracted, the **ViewModel becomes the Model's sole consumer** and the View stops reading the Model directly.

**The rule:** extract a layer when it **earns its place** — never preventively. **Testing is the tiebreaker:** if extracting makes non-trivial logic testable without a DOM, lean toward extracting; if the logic is trivial (formatting a value, holding one flag), don't — an empty pass-through layer is ceremony.

**Add a Model** when there is **non-trivial domain logic** — rules that would be true with no UI at all (validation, calculations, constraints, graph structure). A Model is pure and trivially unit-testable; that is a strong reason to separate it. A datepicker's calendar rules or an autocomplete's filtering rules belong in a Model. Incrementing a number does not.

## 3. Testing shape

Target a **pyramid**, and prefer designs that make one possible:

- **Base (many, fast, no DOM):** domain **Models** and **ViewModels** — plain classes, instantiated and asserted directly. Push logic here; this is where testing is cheap.
- **Middle (fewer, with DOM):** **widgets and elements** as custom elements — mounted, driven, asserted on rendered output and dispatched events.
- **Tools:** the base **store** and the **region helper** — their behaviours are pinned once, each in its own suite (`docs/store.md`, `docs/regions.md`).

If a piece of logic is hard to test because it needs a DOM, that is the signal to extract it into a plain class — not to write a heavier test. Mechanics (mount helpers, what to assert, jsdom limits) are in the `web-components` skill, `testing.md`.

## 4. Repo layout — pnpm monorepo

The library and the apps live in **one pnpm workspace**, as separate packages under `src/`. Apps depend on the library via the workspace protocol.

```
pnpm-workspace.yaml    # workspace globs: src/lib, src/apps/*
src/
  lib/                 # the library package — self-contained, no app state
    core/              # tools: evented.ts, store.ts, freeze.ts, ids.ts, regions.ts
    elements/          # UI elements (ui-button, ui-checkbox, ...)
    widgets/           # widgets + their local models (e.g. widgets/datepicker/)
  apps/
    <app>/             # an individual app (Vite) — imports the lib as a workspace dep
    sandbox/           # a throwaway app for testing ideas (disposable)
docs/
  plan.md              # this file
  store.md             # the store: usage, rules, and wiring a widget to it
  regions.md           # the content-region helper: surface, rules, dev warnings
  <widget>-plan.md     # per-widget specs and task breakdowns
CLAUDE.md              # short rules (auto-loaded)
.claude/skills/
  web-components/      # component authoring skill
human.md               # operator guide (not for the agent)
```

- Tests co-located as `*.test.ts` next to source.
- `src/lib` holds **only** self-contained library code. The base `Store` is a library tool; **concrete domain stores and app-level wrappers live in an app under `src/apps/`**, never in `src/lib`.
- Apps import the library as a **workspace package** (e.g. `import { Store } from '@<scope>/lib/core'`), never by a relative path into `src/lib`. Dependency points **app → lib** only.
- Apps consume a component through its **public contract only** — tag, attributes, properties, custom properties, events. Never query into a component's internal DOM, never style its internal class names. This is what keeps the light-DOM decision reversible (`rationale.md`).
- Keep experiment apps (e.g. `src/apps/sandbox`) disposable — one folder per idea.
