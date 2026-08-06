---
name: web-components
description: House rules for authoring vanilla Web Components (custom elements) in this repo — UI elements and widgets. Covers classification, folder anatomy, tag/class/event naming, registration, lifecycle, the setup() readiness gate, props-down/events-up, the html() skeleton pattern, and CSS conventions. Use this whenever creating, modifying, reviewing, or planning any custom element, UI element, or widget in src/lib — even for a "quick" component, a prototype in src/apps/sandbox, or a small edit to an existing one.
---

# Authoring Web Components

Mechanics for building components in this repo. Architecture (MVVM, layering, store, repo layout) lives in `docs/plan.md` — read it when a task needs it; this file does not restate it.

Companions, read when relevant:

- `accessibility.md` — required before writing any interactive component.
- `testing.md` — required before writing tests.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively. Pragmatic is not careless: the code must be easy to read, easy to understand, easy to maintain, easy to scalate and easy to test.**

## 1. Classify first

Ask: strip away every external input — is there anything left to remember or decide?

- **Nothing → UI element.** Pure view. Lives in `src/lib/elements/`. Tag prefix `ui-`.
- **Something → widget.** Owns internal state and/or logic. Lives in `src/lib/widgets/<name>/`. Tag prefix `widget-`.

The name never decides it. A date**picker** is a widget; a date**display** that only formats a passed-in value is a UI element.

Sub-elements that a widget owns and that are dumb (e.g. a row it stamps out) are UI elements: `ui-` prefix, private to the widget's folder unless another component needs them.

## 2. Folder anatomy

```
src/lib/widgets/<name>/
  <name>.ts        # the element class + factory, defines the tag
  <name>.css       # imported by <name>.ts
  <name>-dom.ts    # cls map, selector constants — no DOM code
  <name>.test.ts   # co-located
  index.ts         # public exports: class, factory, public types
```

UI elements follow the same file set under `src/lib/elements/<name>/`.

Naming:

| Thing | Convention | Example |
|---|---|---|
| Tag | `ui-<name>` / `widget-<name>` | `widget-checkbox-tree` |
| Class | PascalCase + `Element` | `CheckboxTreeElement` |
| CSS block | tag name without prefix | `.checkbox-tree__row` |
| CSS modifier | `--` suffix | `.checkbox-tree__row--leaf` |
| Event | `<tag>:<verb>` | `widget-checkbox-tree:change` |

## 3. Registration

Module-level, guarded, at the bottom of the component file:

```ts
if (!customElements.get('ui-toggle')) customElements.define('ui-toggle', UiToggleElement);

declare global {
  interface HTMLElementTagNameMap { 'ui-toggle': UiToggleElement }
}
```

Importing the module makes the tag work — that is what allows declaring it in HTML. The guard keeps test files from double-defining.

## 4. Lifecycle

- **Constructor is inert.** No DOM, no attributes, no children, no listeners. The spec forbids it and it breaks `document.createElement`.
- **`connectedCallback` is idempotent.** It runs again on every DOM move. Guard rendering and subscription so a move does not rebuild or double-subscribe.
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

- **Never read state, props, or the DOM in a field initializer.** Field init runs at construction, which can precede everything. Initialize empty; populate on connect or in `setup()`.

## 5. `setup()` — widgets only

A widget renders only when it has everything it needs. It must be instantiable both from HTML and programmatically, so readiness is a gate, not an event order.

- **One options object.** `setup(options: FooSetup): void`. All dependencies and required data arrive here.
- **Called once.** A second call is a no-op. Later change goes through properties and commands, never a re-setup.
- **Attributes can satisfy readiness.** A widget fully configurable by attributes is ready without `setup()` ever being called.
- **Not ready = render nothing.** No placeholder, no partial DOM, no error.
- **Two entry points, one gate.** Both `connectedCallback` and `setup()` end with the same call:

```ts
#renderIfReady() {
  if (!this.isConnected || this.#rendered || !this.#isReady()) return;
  this.#render();
  this.#rendered = true;
}
```

- **Commands throw before setup.** A private `#assertReady(method)` at the top of every command, with a message naming component and method: `widget-checkbox-tree: setup() must be called before add()`.
- **Getters return safe empties** — `[]`, `0`, `null`. Asking a not-yet-configured widget what it holds is legitimate; the honest answer is "nothing".
- **No public `destroy()`.** The disconnect rule covers it. Add one only for a component that grabs something outside itself that GC will not reclaim (`setInterval`, a `window` listener, a `ResizeObserver`) — and say why.

UI elements have no `setup()`. They render immediately with safe defaults and accept props as they arrive.

## 6. Props down

- **Properties for rich data** — objects, arrays, callbacks. Properties are the primary API.
- **Attributes for scalars** — strings, numbers, booleans. Add `observedAttributes` only when the component must react to an outside change.
- **Never accept a function, class instance, or DOM node through an attribute.**
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

- **A component never reads its own light-DOM children.** Children may not be parsed when the element upgrades. Everything the component needs arrives through `setup()`, properties, or attributes — content as a string or a render callback. If a component genuinely needs consumer DOM, it is passed **in the setup object** as an element or fragment.

## 7. Events up

- Name `<tag>:<verb>`, `bubbles: true`. No Shadow DOM, so `composed` is irrelevant — omit it.
- `detail` is plain serializable data. No class instances, no DOM nodes, no functions.
- **Reflecting state never emits; only a user gesture emits.** A command that sets state (`setChecked`, `setValue`) updates and repaints silently — its caller already knows. A click or keypress emits. This is what makes a component safe to wire to anything without echo loops.
- Never emit during render or from `connectedCallback`.

## 8. `html()`

Static skeletons come from an `html()` method returning a string:

```ts
html(): string {
  return `<div class="${cls.row}"><span class="${cls.toggle}" aria-hidden="true"></span><div class="${cls.content}"></div></div>`;
}
```

- **Static only. Consumer data never enters the string.** Set `this.innerHTML = this.html()` once, query the references you need, then insert text with `textContent` and set attributes imperatively.
- Class names come from the `cls` map (§9), never as inline literals.
- Skip `html()` where it is not convenient — a single-element component, or nodes built in a loop. Use `document.createElement` there.
- Unique ids for ARIA relationships come from the shared helper in `src/lib/core/`, never hand-rolled per component.

## 9. CSS

- **Every component owns a `.css` file, imported by its own module** (`import './foo.css'`). Nothing else imports it.
- **Nested CSS where it helps** readability. Do not nest so deep the selector becomes unreadable.
- **Class names are never hardcoded in JS.** A frozen `cls` object in `<name>-dom.ts` is the only JS-side source:

```ts
export const cls = { row: 'checkbox-tree__row', toggle: 'checkbox-tree__toggle' } as const;
```

The literal string appears in exactly two places in the repo: the `.css` file and this map. `cls` is **internal** — do not export it from `index.ts`.

- **Set an explicit `display`.** Custom elements default to `display: inline`.
- **Prevent the upgrade flash** — before the tag registers, the browser renders its contents as unstyled inline text:

```css
ui-toggle:not(:defined) { visibility: hidden; }
```

- **State comes from attributes, not JS-toggled inline styles.** Style from `[aria-expanded="false"]`, `[data-state="mixed"]`, or a modifier class.
- **Theming is the public styling API**, in two tiers: shared tokens `--ui-*` (e.g. `--ui-focus-ring`), per-component knobs named after the tag (e.g. `--checkbox-tree-indent`). Give every knob a fallback.
- Keep specificity low (`:where()` where useful) so apps can override. No `!important`.
- Scope with `>` where a parent's state must not restyle descendants.

## 10. Composition

- **Prefer a native element when the component is a single control.** A real `<button>` brings Enter/Space, focus, and role for free.
- **Exception: composite widgets.** Where the container owns the keyboard model, a native focusable element inside a row creates a second, competing tab stop. Use a non-focusable visual plus state on the row instead. See `accessibility.md`.
- **Compose, don't inherit.** A widget composes UI elements inside it and holds the intelligence.
- **Extend `HTMLElement`.** Extending built-ins (`is="..."`) is not an option — Safari never shipped it. A shared base class is allowed only once three or four components have provably identical plumbing, never up front.

## 11. Do not

- No Shadow DOM. No UI framework, no JSX, no runtime dependency a task did not explicitly require.
- No global store, app service, or cross-widget import inside `src/lib`.
- No consumer data interpolated into `html()`.
- No listeners on a dumb element — the owning widget delegates at the container.
- No `setTimeout` to "wait for" the DOM; no `MutationObserver` unless a concrete need forces it.
- No class-name literals in JS; no CSS in JS.
- No emitting from a command that reflects state.

## 12. Before reporting done

- `pnpm test` — the closest suite, run in the terminal.
- `pnpm typecheck` — no new errors.
- `pnpm lint` — clean on the new files.
- Accessibility checklist in `accessibility.md` walked, for anything interactive.
- Code and comments in English.
