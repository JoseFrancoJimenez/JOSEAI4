# Project — Mini UI / Widget / Tools Library

A library of **self-contained** UI elements, widgets, and tools reused across multiple apps — some GIS, some not. This repo also holds throwaway prototypes for testing ideas.

**Guiding principle: be pragmatic — no over-engineering.** Build the minimum that works. Add structure, layers, or abstraction only when a concrete, present need forces it — never speculatively. Be pragmatic but not careless. Deliver good quality code that is easy to read, easy to understand, easy to maintain, and easy to test.

**Stack:** **pnpm** monorepo, **Vite** + **TypeScript**, **vanilla** Web Components / custom elements. **No UI frameworks** (no React, Vue, Svelte), no JSX. No runtime dependencies in library code beyond what a task explicitly requires (like a map adapter in the lib using OpenLayers).

**Layout:** monorepo — the library lives in `src/lib`, apps in `src/apps/<app>`. Apps depend on the library as a workspace package (`app → lib` only). See `plan.md` §6.

This file is **guidance, not enforcement**. The hard invariants below are also enforced by **tests and lint** — that is the real safety net. When a task touches the store or a specced widget, **read the detailed doc** instead of guessing.

## Read on demand (do not inline these every turn)

- Architecture & patterns: `docs/plan.md`

## Non-negotiable rules

**Library boundaries**

- Library code is self-contained: UI elements and widgets depend on **nothing** outside their own context — no global stores, no app services, no framework imports.
- Dependencies point **app → library**, never the reverse.
- **No Shadow DOM.** All custom elements render into **light DOM**.
- Contract for every element/widget: **props-down / events-up**. Input by property/attribute; output by `CustomEvent`.

**State (the store tool)**

- **Plain, serializable data only.** Prefer object **records** over `Map`/`Set`. No class instances, DOM nodes, functions, or map instances in state.
- Change detection is **`Object.is` on references**. **Never `JSON.stringify`** for equality.
- **No clone-on-read or clone-on-write.**
- Heavy data stays **out** of state: store ids + light metadata; heavy payloads live in a service cache keyed by id.
- The base `Store` is for **app-level global state**. Library widgets use their **own local state** (a listener array or their own `Evented` subclass) — never the global `Store`.

**Design**

- Pattern is **MVVM**. Add layers (ViewModel, Model) **by complexity, never preventively**. Extract a ViewModel (a plain, DOM-free class) only when presentation logic is non-trivial and needs testing without a DOM.
- **Testing is first-class.** Prefer architectures where logic is DOM-free and unit-testable.
- **Single writer** for any shared model, enforced by a **read-only interface** at injection.

## Commands

- Test: `pnpm test`  ← set to this repo's real commands; monorepo, so may be workspace-scoped (e.g. `pnpm --filter <pkg> test`)
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

## Before finishing

Run the closest test and typecheck before reporting a task complete.

## Language

Code must always be written in English. 

## First words.

Your first words, per session, must always be "I've read the docs, I am ready". and specify what documents have you read (name and route).
