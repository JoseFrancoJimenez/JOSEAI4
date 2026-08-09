# Project — Mini UI / Widget / Tools Library

A library of **self-contained** UI elements, widgets, and tools reused across multiple apps — some GIS, some not. This repo also holds throwaway prototypes for testing ideas.

**Be pragmatic — no over-engineering.** Build the minimum that works. Add structure, layers, or abstraction only when a concrete, present need forces it — never speculatively. Pragmatic is not careless: the code must be easy to read, easy to understand, easy to maintain, easy to scale and easy to test.

**Stack:** **pnpm** monorepo, **Vite** + **TypeScript**, **vanilla** Web Components / custom elements. **No UI frameworks** (no React, Vue, Svelte), no JSX. No runtime dependencies in library code beyond what a task explicitly requires. Target evergreen browsers: use platform features directly — no polyfills, no defensive fallbacks.

**Layout:** the library lives in `src/lib`, apps in `src/apps/<app>`. Apps depend on the library as a workspace package. See `docs/plan.md` §4.

## Read on demand

Do not inline these every turn. Read the one a task touches, and read it rather than guessing.

- **Building a component** (any custom element, UI element, or widget) → the `web-components` skill in `.claude/skills/web-components/`.
- **Architecture & patterns** (element vs widget, MVVM layering, repo layout) → `docs/plan.md`.
- **App state** (the store, and wiring a widget to it) → `docs/store.md`.
- **Maps / GIS** (engine adapters, layer configs, the map widget) → `docs/maps.md`.
- **Consumer content** (a component that accepts children — regions, harvesting, filling) → `docs/regions.md`.
- **Why a rule exists** (the operator asks "why is this like this?") → `docs/rationale.md`. Do not load it for normal tasks.

Rules live in exactly one of those. Where a rule must appear twice, the second copy is a pointer, never a restatement.

## Non-negotiable rules

- Library code is **self-contained**: UI elements and widgets depend on **nothing** outside their own context — no global stores, no app services, no framework imports. Engine imports (e.g. OpenLayers) are allowed only inside `src/lib/maps/` — policy in `docs/maps.md`.
- Dependencies point **app → library**, never the reverse.
- **No Shadow DOM.** All custom elements render into **light DOM**. Decided on purpose; the reasoning and the conditions that would reopen it are in `docs/rationale.md`.
- Contract for every element/widget: **props-down / events-up**. Input by property/attribute — and, for consumer content, declared **content regions** (see the skill). Output by `CustomEvent`, or by a native event that already bubbles out of the host — never both for the same interaction.
- The base `Store` is for **app-level global state**. Library widgets never use a store — not even a private instance; local state is a small listener array or `Evented` (`docs/store.md`).
- **Testing is first-class.** Prefer architectures where logic is DOM-free and unit-testable.

This file is guidance; tests and lint are the enforcement.

## Commands

- Test (all): `pnpm test`
- Test (scoped, while iterating): `pnpm vitest run <path>`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

Run the closest test, plus typecheck and lint, before reporting a task complete. Run them in the terminal, not in chat.

## Dev server

Never start, stop, or poll a dev server (`pnpm dev`, `vite`, `curl`/fetch against a local port, etc.) without the user's explicit consent — it burns tokens for little signal. If a change needs visual or interactive verification, ask the user to run it and tell them exactly what to check instead of doing it yourself.

## Language

Code, comments, and commit messages are always in English.

## First words

Your first words in a session must be "I've read the docs, I am ready", followed by the documents you actually opened for this task, by name and path. List only what you read — not the full catalogue.