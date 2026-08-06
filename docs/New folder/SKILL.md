---
name: web-components
description: House rules for authoring vanilla Web Components (custom elements) in this repo — UI elements and widgets. Covers classification, folder anatomy, tag/class/event naming, registration, lifecycle, the setup() readiness gate, props-down/events-up, content regions (light-DOM consumer content), the html() skeleton pattern, and CSS conventions. Use this whenever creating, modifying, reviewing, or planning any custom element, UI element, or widget in src/lib — even for a "quick" component, a prototype in src/apps/sandbox, or a small edit to an existing one.
---

# Authoring Web Components

Mechanics for building components in this repo. Architecture (MVVM, layering, repo layout) lives in `docs/plan.md`; app state lives in `docs/store.md`. This file does not restate either.

Companions, read when relevant:

- `accessibility.md` — required before writing any interactive component.
- `testing.md` — required before writing tests.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.**

## 1. Classify first

Ask: strip away every external input — is there anything left to remember or decide?

- **Nothing → UI element.** Pure view. Lives in `src/lib/elements/`. Tag prefix `ui-`.
- **Something → widget.** Owns internal state and/or logic. Lives in `src/lib/widgets/<name>/`. Tag prefix `widget-`.

The name never decides it. A date**picker** is a widget; a date**display** that only formats a passed-in value is a UI element.

Sub-elements that a widget owns and that are dumb (e.g. a row it stamps out) are UI elements: `ui-` prefix, private to the widget's folder unless another component needs them.

## 2. Folder anatomy

```
src/lib/widgets/<name>/
  <name>.ts        # the element class, defines the tag
  <name>.css       # imported by <name>.ts
  <name>-dom.ts    # cls map, region names, selector constants — no DOM code
  <name>.test.ts   # co-located
  index.ts         # public exports: class, public types
```

UI elements follow the same file set under `src/lib/elements/<name>/`.

Naming:

| Thing | Convention | Example |
|---|---|---|
| Tag | `ui-<name>` / `widget-<name>` | `widget-datepicker` |
| Class | PascalCase + `Element` | `DatepickerElement` |
| CSS block | **full tag name** | `.widget-datepicker__day` |
| CSS modifier | `--` suffix | `.widget-datepicker__day--today` |
| Event | `<tag>:<verb>` | `widget-datepicker:change` |
| Content region | lower-kebab name | `data-region="icon"` / `data-outlet="icon"` |

The CSS block is the full tag, prefix included: class names are global in light DOM, and `.button` or `.day` will collide with app CSS; `.ui-button__icon` cannot.

## 3. Registration

Module-level, guarded, at the bottom of the component file:

```ts
if (!customElements.get('ui-button')) customElements.define('ui-button', UiButtonElement);

declare global {
  interface HTMLElementTagNameMap { 'ui-button': UiButtonElement }
}
```

Importing the module makes the tag work — that is what allows declaring it in HTML. The guard keeps test files from double-defining.

**Components are loaded as ES modules.** Module scripts are deferred by the HTML spec, so definitions register after the document is parsed and elements upgrade with their children complete. A classic blocking script that registers a definition mid-parse breaks region harvesting (§7).

## 4. Lifecycle

- **Constructor is inert.** No DOM, no attributes, no children, no listeners. The spec forbids it and it breaks `document.createElement`.
- **`connectedCallback` is idempotent.** It runs again on every DOM move. Guard harvesting, rendering, and subscription so a move does not repeat them.

```ts
connectedCallback() {
  this.#upgradeProperties();
  if (!this.#harvested) { this.#regions = harvestRegions(this); this.#harvested = true; }
  this.#subscribe();
  this.#renderIfReady();
}
```

`#harvested` and `#rendered` are **separate flags** — for a widget they become true at different moments.

- **`disconnectedCallback` distinguishes a move from a destroy.** A move fires disconnect then connect. Defer teardown by a microtask and bail if the element came back:

```ts
disconnectedCallback() {
  queueMicrotask(() => {
    if (this.isConnected) return;   // it was a move
    this.#teardown();
  });
}
```

That is the default. A component may override it where a concrete need forces something else — say so in a comment.

- **Listeners use an `AbortController`**, created on connect, aborted in `#teardown()`, so removal is automatic:

```ts
this.#controller = new AbortController();
this.addEventListener('click', this.#onClick, { signal: this.#controller.signal });
```

- **Never read state, props, the DOM, or children in a field initializer.** Field init runs at construction, which precedes everything. Initialize empty; populate on connect or in `setup()`.

## 5. `setup()` — widgets only

A widget renders only when it has everything it needs. It must be instantiable both from HTML and programmatically, so readiness is a gate, not an event order.

- **One options object.** `setup(options: FooSetup): void`. All dependencies and required data arrive here; region content may too (§7).
- **Called once.** A second call is a no-op. Later change goes through properties and commands, never a re-setup.
- **Attributes can satisfy readiness.** A widget fully configurable by attributes is ready without `setup()` ever being called.
- **Region content never gates readiness.** Regions are optional presentation; readiness is data and dependencies only.
- **Not ready = render nothing.** No placeholder, no partial DOM, no error.
- **Two entry points, one gate.** Both `connectedCallback` and `setup()` end with the same call:

```ts
#renderIfReady() {
  if (!this.isConnected || this.#rendered || !this.#isReady()) return;
  this.#render();
  this.#rendered = true;
}
```

- **Commands throw before setup.** A private `#assertReady(method)` at the top of every command, with a message naming component and method: `widget-datepicker: setup() must be called before select()`.
- **Getters return safe empties** — `[]`, `0`, `null`. Asking a not-yet-configured widget what it holds is legitimate; the honest answer is "nothing".
- **No public `destroy()`.** The disconnect rule covers it. Add one only for a component that grabs something outside itself that GC will not reclaim (`setInterval`, a `window` listener, a `ResizeObserver`) — and say why.

UI elements have no `setup()`. They render immediately with safe defaults and accept props as they arrive.

## 6. Props down

- **Properties for rich data** — objects, arrays, callbacks, nodes. Properties are the primary API.
- **Attributes for scalars** — strings, numbers, booleans. Add `observedAttributes` only when the component must react to an outside change.
- **Never accept a function, class instance, or DOM node through an attribute.**
- **Consumer content is a third channel** — content regions, §7.
- **Upgrade public properties on connect.** A property set before the class registers becomes an own property that shadows the accessor, so the setter never runs:

```ts
#upgradeProperty(prop: keyof this) {
  if (!Object.hasOwn(this, prop)) return;
  const value = this[prop];
  delete this[prop];
  this[prop] = value;
}
```

Call it in `connectedCallback` for every public property with a setter that does work. Mainly a UI-element concern (`ui-slider.value`, `ui-toggle.checked`); widgets take their input through `setup()`.

## 7. Content regions — consumer content in light DOM

A **content region** is a named, fixed area of a component that a consumer can fill — an icon, a label, a header, an empty-state message. Fillable from HTML and from code; both paths feed the same fill step, so the component behaves identically either way.

**These are not Shadow-DOM slots**, and differ from them in two honest ways: supplied nodes are **moved** into the component's skeleton (not projected — ownership effectively transfers), and capture is **one-time** (children added to the host later are not picked up; use `setContent`).

**Scope:** regions are for **fixed, singular areas declared in the skeleton**. Repeated per-item content — rows, list items, options — is **not** a region job: it goes through a render callback passed via `setup()` or a property. In composite widgets, per-item content is **strings only**, never nodes (`accessibility.md` §5).

**Consumer side, HTML** — `data-region="<name>"` on a direct child; children without it (bare text included) form the `default` region:

```html
<ui-button>
  <span data-region="icon">★</span>
  Save
</ui-button>
```

**Consumer side, code** — rich data, so a method, never an attribute:

```ts
button.setContent('icon', iconNode);            // Node, DocumentFragment, or string
datepicker.setup({ content: { footer: 'Week starts Monday' } });
```

**Component side** — outlets are marked `data-outlet="<name>"` in the skeleton, the component's own default written inside. The default region's outlet is explicitly `data-outlet="default"`:

```ts
html(): string {
  return `<button type="button" class="${cls.control}">
    <span class="${cls.icon}" data-outlet="icon" aria-hidden="true"></span>
    <span class="${cls.label}" data-outlet="default"></span>
  </button>`;
}
```

Rules:

- **Harvest once, in `connectedCallback`, before anything else** (§4), with the shared `harvestRegions` helper from `src/lib/core/`. It empties the host immediately, so consumer markup is never visible unstyled — which matters for a widget that will not render until `setup()`. The `#harvested` flag prevents a second harvest on a DOM move from swallowing the component's own skeleton.
- **Harvest iterates `childNodes`, not `children`** — bare text like `Save` must survive — and **skips whitespace-only text nodes**, so pretty-printed HTML does not fill the `default` region and suppress the component's default.
- **Precedence:** harvested content is the initial fill; `setContent` **overrides** harvested content whenever it is called; among `setContent` calls, the latest wins.
- **Fill:** supplied content replaces the outlet's children; a region nobody supplied keeps the default written in the skeleton; an outlet with neither is left **empty and hidden by CSS** (§10) — never removed, so a later `setContent` still has a target.
- **Write empty outlets with zero content** — `<span data-outlet="icon"></span>`, no inner whitespace — or `:empty` will not match.
- **Strings enter as text** (`textContent`), never parsed as HTML. Nodes are **moved**, never serialized. Consumer data never reaches `html()`.
- **`setContent` is input provisioning, not a command:** it never throws and is exempt from `#assertReady`. Before render it stashes; at fill time the stash applies; after render it applies immediately.
- **Declare the region names** a component accepts in `<name>-dom.ts` alongside `cls`, and export their type from `index.ts`. Unknown region names are ignored, not an error.
- **A custom element placed in a region must survive a full teardown.** Harvest detaches it; for a widget host it can stay detached until `setup()` arrives, so its disconnect microtask fires and legitimately tears it down; the fill step reattaches it and its connect runs again. The lifecycle rules in §4 (idempotent connect, symmetric teardown) are exactly what make this safe — a region component must not assume it stays attached.
- **Timing.** Harvest sees children present in the initial HTML parse (module scripts are deferred, §3), in an `innerHTML` assignment, in a cloned `<template>`, and when children are appended *before* the host is attached. It does **not** see children appended after the host is attached — use `setContent` there. The shared helper warns in dev when an element upgrades while `document.readyState === 'loading'`, which means a classic blocking script registered the definition mid-parse.
- **Region content is presentation, never semantics.** The component owns roles, state, and the accessible name; the consumer supplies what is displayed. See `accessibility.md` §5.

## 8. Events up

- Name `<tag>:<verb>`, `bubbles: true`. No Shadow DOM, so `composed` is irrelevant — omit it.
- `detail` is plain serializable data. No class instances, no DOM nodes, no functions.
- **Reflecting state never emits; only a user gesture emits.** A command that sets state (`setSelected`, `setValue`) updates and repaints silently — its caller already knows. A click or keypress emits. This is what makes a component safe to wire to anything without echo loops.
- Never emit during render or from `connectedCallback`.

## 9. `html()`

Static skeletons come from an `html()` method returning a string.

- **Static only. Consumer data never enters the string.** Set `this.innerHTML = this.html()` once, query the references you need, then insert text with `textContent` and set attributes imperatively.
- Class names come from the `cls` map (§10), never as inline literals.
- Region outlets and their defaults belong in the skeleton (§7).
- Skip `html()` where it is not convenient — a single-element component, or nodes built in a loop. Use `document.createElement` there.
- Unique ids for ARIA relationships come from the shared helper in `src/lib/core/`, never hand-rolled per component.

## 10. CSS

- **Every component owns a `.css` file, imported by its own module** (`import './foo.css'`). Nothing else imports it.
- **Nested CSS where it helps** readability. Do not nest so deep the selector becomes unreadable.
- **Class names are never hardcoded in JS.** A frozen `cls` object in `<name>-dom.ts` is the only JS-side source:

```ts
export const cls = { control: 'ui-button__control', icon: 'ui-button__icon', label: 'ui-button__label' } as const;
```

The literal string appears in exactly two places in the repo: the `.css` file and this map. `cls` is **internal** — do not export it from `index.ts`.

- **Set an explicit `display`.** Custom elements default to `display: inline`.
- **Prevent the upgrade flash** — before the tag registers, the browser renders its contents as unstyled inline text:

```css
ui-button:not(:defined) { visibility: hidden; }
```

- **Hide empty outlets** so an unfilled region takes no space:

```css
ui-button [data-outlet]:empty { display: none; }
```

- **State comes from attributes, not JS-toggled inline styles.** Style from `[aria-expanded="false"]`, `[data-state="mixed"]`, or a modifier class.
- **Do not style region content beyond layout.** The outlet controls placement, size, and spacing; typography and colour of consumer-supplied nodes are the consumer's business.
- **Theming is the public styling API**, in two tiers: shared tokens `--ui-*` (e.g. `--ui-focus-ring`), per-component knobs named after the tag (e.g. `--widget-datepicker-cell-size`). Give every knob a fallback.
- Keep specificity low (`:where()` where useful) so apps can override. No `!important`.
- Scope with `>` where a parent's state must not restyle descendants.

## 11. Composition — what to reach for, in order

1. **A library component, if one exists for the job.** Compose `ui-button`, not a bare `<button>`; `ui-checkbox`, not a bare `<input type="checkbox">`. The library element already carries this repo's styling, states, and accessibility decisions, and fixing it once fixes every consumer.
2. **The native element, when no library component covers it.** A real `<button>` brings Enter/Space, focus, and role for free.
3. **A hand-rolled control, only when neither fits** — and then follow the APG pattern exactly.

What makes step 1 safe: **a library element is itself built on the native element.** `ui-button` renders a real `<button>` inside its light DOM; it wraps native semantics, it does not reimplement them. A `ui-` element that paints a `<div>` where a native control exists is a bug in that element.

**Exception — composite widgets.** Where the container owns the keyboard model, no focusable element belongs inside an item, library or native alike: it creates a second tab stop competing with the roving tabindex. Use a non-focusable visual plus state on the item. See `accessibility.md` §3.

**Compose, don't inherit.** A widget composes UI elements inside it and holds the intelligence.

**Extend `HTMLElement`.** Extending built-ins (`is="..."`) is not an option — Safari never shipped it. A shared base class is allowed only once three or four components have provably identical plumbing, never up front.

## 12. Do not

- No Shadow DOM. No UI framework, no JSX, no runtime dependency a task did not explicitly require.
- No global store, app service, or cross-widget import inside `src/lib`.
- No consumer data interpolated into `html()`; no consumer string parsed as HTML.
- No re-harvesting regions after the first connect.
- No per-item nodes in composite widgets — strings via callback only.
- No listeners on a dumb element — the owning widget delegates at the container.
- No `setTimeout` to "wait for" the DOM; no `MutationObserver` unless a concrete need forces it.
- No class-name literals in JS; no CSS in JS.
- No emitting from a command that reflects state.

## 13. Before reporting done

- `pnpm test` — the closest suite, run in the terminal.
- `pnpm typecheck` — no new errors.
- `pnpm lint` — clean on the new files.
- Accessibility checklist in `accessibility.md` walked, for anything interactive.
- Code and comments in English.
