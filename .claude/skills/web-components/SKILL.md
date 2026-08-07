---
name: web-components
description: House rules for authoring vanilla Web Components (custom elements) in this repo — UI elements and widgets. Covers classification, folder anatomy, tag/class/event naming, registration, lifecycle, the setup() readiness gate, props-down/events-up, content regions (light-DOM consumer content), the html() skeleton pattern, and CSS conventions. Use this whenever creating, modifying, reviewing, or planning any custom element, UI element, or widget in src/lib — even for a "quick" component, a prototype in src/apps/sandbox, or a small edit to an existing one.
---

# Authoring Web Components

Mechanics for building components in this repo. Architecture (MVVM, layering, repo layout) lives in `docs/plan.md`; app state lives in `docs/store.md`. This file does not restate either.

Companions, read when relevant:

- `docs/accessibility.md` — required before writing any interactive component.
- `docs/testing.md` — required before writing tests.
- `docs/regions.md` — the region helper's own spec, required before building a component that accepts consumer content.

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
// A widget with regions — the fullest case. Drop the lines that do not apply.
connectedCallback() {
  this.classList.add(cls.host);
  this.#upgradeProperties();
  if (!this.#harvested) {                                  // regions only
    this.#regions = harvestRegions(this, regionNames);     // regionNames from <name>-dom.ts
    this.#harvested = true;
  }
  this.#subscribe();                                       // only if it subscribes to anything
  this.#renderIfReady();                                   // #render() for a UI element — no gate
}
```

Not every line applies to every component. A UI element with no regions and no subscriptions is just `classList.add`, `#upgradeProperties()`, `#render()`. Harvest appears only in a component that declares regions (§7); `#renderIfReady()` only in a widget with a `setup()` gate (§5).

Order matters and is fixed: **property upgrade, then harvest, then render.** Harvest must precede any write to the host's children — it is the first thing that touches the DOM, not the first statement in the method.

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
- **Attributes for scalars** — strings, numbers, booleans. Add `observedAttributes` only when the component must react to an outside change. An attribute styled entirely by CSS is not observed; note the omission in a comment so it does not read as an oversight.
- **Never accept a function, class instance, or DOM node through an attribute.**
- **Consumer content is a third channel** — content regions, §7.
- **A public ARIA attribute on the host is an input too.** Where the host forwards `aria-label` / `aria-labelledby` to an inner control, observe them — forwarding once at render leaves a later `setAttribute` silently doing nothing.
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

**Regions are opt-in.** A component that takes no consumer content declares none, does not call `harvestRegions`, and is simpler for it — see §7.1 for what it owes the consumer instead. The helper's own spec, including its dev warnings and the merge rule for repeated names, is `docs/regions.md`.

**These are not Shadow-DOM slots**, and differ from them in two honest ways: supplied nodes are **moved** into the component's skeleton (not projected — ownership effectively transfers), and capture is **one-time** (children added to the host later are not picked up; use `setContent`).

**Scope:** regions are for **fixed, singular areas declared in the skeleton**. Repeated per-item content — rows, list items, options — is **not** a region job: it goes through a render callback passed via `setup()` or a property. In composite widgets, per-item content is **strings only**, never nodes (`accessibility.md` §5).

**Consumer side, HTML** — `data-region="<name>"` on a direct child; children without it (bare text included) form the `default` region:

```html
<widget-panel>
  <span data-region="header">Layers</span>
  Nothing selected
</widget-panel>
```

**Consumer side, code** — rich data, so a method, never an attribute:

```ts
panel.setContent('header', headerNode);         // Node, DocumentFragment, or string
datepicker.setup({ content: { footer: 'Week starts Monday' } });
```

**Component side** — outlets are marked `data-outlet="<name>"` in the skeleton, the component's own default written inside. The default region's outlet is explicitly `data-outlet="default"`:

```ts
html(): string {
  return `<section class="${cls.panel}">
    <h2 class="${cls.header}" data-outlet="header"></h2>
    <div class="${cls.body}" data-outlet="default"></div>
  </section>`;
}
```

Rules:

- **Harvest once, in `connectedCallback`, before anything writes to the host** (§4), with the shared `harvestRegions` helper from `src/lib/core/`, passing the component's declared region names. It empties the host immediately, so consumer markup is never visible unstyled — which matters for a widget that will not render until `setup()`. The `#harvested` flag prevents a second harvest on a DOM move from swallowing the component's own skeleton.
- **Harvest iterates `childNodes`, not `children`** — bare text like `Save` must survive — and **skips whitespace-only text nodes**, so pretty-printed HTML does not fill the `default` region and suppress the component's default.
- **Timing.** Harvest sees children present in the initial HTML parse (module scripts are deferred, §3), in an `innerHTML` assignment, in a cloned `<template>`, and when children are appended *before* the host is attached. For anything later, see §7.1.
- **Precedence, in two parts.** Within a channel it is last-writer-wins, and **harvest always counts as the first write** — whenever it physically runs, it represents what was in the markup, which logically preceded any code. So `setContent` called before the host is attached still beats the harvest that follows it. The part that rule does not settle is a **convenience attribute** (a `label` that writes into an outlet) competing with a harvested region for the same outlet at first render, since both arrive in the same markup at the same moment: **the harvested region wins**, as the more specific of the two. After first render there is no ambiguity — latest write wins, whatever the channel.
- **Fill:** supplied content replaces the outlet's children; a region nobody supplied keeps the default written in the skeleton; an outlet with neither is left **empty and hidden by CSS** (§10) — never removed, so a later `setContent` still has a target. Clearing a region after render is `setContent(name, '')`; there is no `unfill`.
- **Write empty outlets with zero content** — `<span data-outlet="icon"></span>`, no inner whitespace — or `:empty` will not match.
- **Strings enter as text** (`textContent`), never parsed as HTML. Nodes are **moved**, never serialized. Consumer data never reaches `html()`.
- **`setContent` is input provisioning, not a command:** it never throws and is exempt from `#assertReady`. Before render it stashes; at fill time the stash applies; after render it applies immediately.
- **Declare the region names** a component accepts in `<name>-dom.ts` alongside `cls`, and export their type from `index.ts`. An unknown name passed to `setContent` is ignored, not an error; an unknown name arriving through **harvest** is a dev-time error, because that content is silently destroyed (`docs/regions.md` §5).
- **A custom element placed in a region must survive a full teardown.** Harvest detaches it; for a widget host it can stay detached until `setup()` arrives, so its disconnect microtask fires and legitimately tears it down; the fill step reattaches it and its connect runs again. The lifecycle rules in §4 (idempotent connect, symmetric teardown) are exactly what make this safe — a region component must not assume it stays attached.
- **Region content is presentation, never semantics.** The component owns roles, state, and the accessible name; the consumer supplies what is displayed. See `accessibility.md` §5.

### 7.1 What happens to consumer children

Light DOM means the host's children are a shared, unguarded surface. Three outcomes, none of them "ignored":

| When | Fate |
|---|---|
| Present at first connect | Harvested and moved into the skeleton |
| Harvested into a region no outlet claims, **or supplied to a component with no regions** | Destroyed — the host is emptied and the skeleton written over it |
| Appended **after** first connect | Never harvested, never overwritten — renders as an unmanaged sibling of the skeleton |

Consequences for an author:

- **After connect, content changes go through properties or `setContent`, never by appending children.** State this in the component's docs; do not guard it with a `MutationObserver` (§12) until a concrete bug earns one.
- **A component that accepts no children should say so in dev.** At connect, before writing the skeleton, `console.error` if the host has non-whitespace children. Silent deletion of the most natural markup a consumer will try is the worst of the three fates, and it is the one with no warning built into the helper.
- A consumer assigning `host.innerHTML` after render wipes the skeleton and orphans the component's cached element references. Same convention covers it; no guard.

## 8. Events up

- **Do not invent an event the platform already provides.** With no Shadow DOM, a native event from an inner control (`click`, `input`, `change`) bubbles out of the host, and consumers listen on the host directly. Re-dispatching it as a `CustomEvent` double-fires every handler. Emit a `CustomEvent` only for something native events do not express — a semantic change, a composite selection, a multi-step result.
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
export const cls = { host: 'ui-button', control: 'ui-button__control', icon: 'ui-button__icon', label: 'ui-button__label' } as const;
```

The literal string appears in exactly two places in the repo: the `.css` file and this map. `cls` is **internal** — do not export it from `index.ts`.

- **Set an explicit `display`.** Custom elements default to `display: inline`.
- **Prevent the upgrade flash** — before the tag registers, the browser renders its contents as unstyled inline text:

```css
ui-button:not(:defined) { visibility: hidden; }
```

- **Give the host a root class matching its tag**, added via `classList.add(cls.host)` in `connectedCallback` (idempotent — harmless to re-add on a DOM move). Select the host and its descendants by that class everywhere else, never by the tag name. A tag selector (`ui-button { ... }`) is lost the moment the component is inherited under a different tag; a class selector survives because the base class still adds it on connect. The one exception is the pre-upgrade rule above — it must stay tag-based, since the class does not exist until `connectedCallback` runs.

```ts
// <name>-dom.ts
const cls = { host: 'ui-button', control: 'ui-button__control', /* … */ } as const;

// <name>.ts
connectedCallback() {
  this.classList.add(cls.host);
  // …
}
```

```css
.ui-button {
  display: inline-block;
  /* …descendant rules nested inside… */
}
```

- **Hide empty outlets** so an unfilled region takes no space:

```css
.ui-button [data-outlet]:empty { display: none; }
```

- **State comes from attributes, not JS-toggled inline styles.** Style from `[aria-expanded="false"]`, `[data-state="mixed"]`, or a modifier class.
- **Do not style region content beyond layout.** The outlet controls placement, size, and spacing; typography and colour of consumer-supplied nodes are the consumer's business.
- **Theming is the public styling API**, in two tiers: shared tokens `--ui-*` (e.g. `--ui-focus-ring`), per-component knobs named after the tag (e.g. `--widget-datepicker-cell-size`). Give every knob a fallback. A component never hardcodes a value a shared token already covers.
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

- **No Shadow DOM.** Decided on purpose, with named costs and a named condition for revisiting — `rationale.md`. Do not reach for it to solve a styling collision or a stray-child bug; those have cheaper answers here.
- No UI framework, no JSX, no runtime dependency a task did not explicitly require.
- No global store, app service, or cross-widget import inside `src/lib`.
- No consumer data interpolated into `html()`; no consumer string parsed as HTML.
- No re-harvesting regions after the first connect.
- No appending children to a host after connect — properties or `setContent` (§7.1).
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

## 14. First line

Every component file begins with this comment, and nothing above it:

```ts
// AWESOME AI
```

It is a read-receipt for this skill: its presence in a diff says the file was written against these rules rather than from memory. It carries no runtime meaning.