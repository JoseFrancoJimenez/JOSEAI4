# Rationale — why the rules are what they are

For me, not for the agent. `SKILL.md` states the rules; this explains the reasoning so a future decision can be revisited on purpose instead of by accident.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.** This was the tiebreaker for nearly every decision below.

## Classification and prefixes

`ui-` vs `widget-` makes the dumb/smart split visible in the markup, so a review can spot a UI element that has quietly grown state. A widget's own dumb sub-elements (a row, a cell) are UI elements even though only that widget uses them — dumbness is about the contract, not about reuse.

## Registration as a module side effect

Chosen over an exported `defineFoo()` because a component must be declarable in HTML: `<widget-foo>` in markup has to work as soon as the module is imported, with nothing to remember to call. The `customElements.get` guard exists because test files import the same module many times and a second `define` throws.

## Constructor is inert

The custom-elements spec forbids setting attributes or children in the constructor. Violating it breaks `document.createElement` and cloning. There is no upside — everything can happen on connect.

## Disconnect = destroy, not move

Moving an element in the DOM fires `disconnectedCallback` then `connectedCallback`. Tearing down on the disconnect means a move silently kills subscriptions. The microtask defers the decision until the browser has finished, and `isConnected` then tells the truth. The matching half is that connect must be idempotent — otherwise a move double-subscribes instead, which is the same bug wearing a different hat.

`AbortController` was chosen over storing bound handlers because removal cannot drift out of sync with addition: one abort releases everything, including listeners added conditionally.

## No `destroy()`

A public teardown method is one more thing for a consumer to forget, and the disconnect rule already covers the normal case. It earns its place only for resources the DOM does not own — timers, `window` listeners, observers — which is rare and should be justified per component.

## `setup()` and the readiness gate

The requirement was: instantiable from HTML *and* programmatically. Those two paths have opposite orders — HTML gives attributes before connect, code often gives data after. A gate that both paths call resolves it without either knowing about the other, and without a "ready" event to subscribe to.

One options object rather than positional arguments: adding a dependency later stays backward-compatible, and named fields read better at the call site.

Setup-once with change through properties and commands keeps the API honest — a component that can be re-set-up is really being told to rebuild, and rebuilding wholesale is exactly what makes surgical, testable updates impossible.

Rendering nothing when not ready (rather than a placeholder) keeps the gate a single boolean. Placeholders can be added later by a consumer wrapping the widget; a placeholder baked in cannot be removed.

Commands throw, getters return empties: calling `add()` on an unconfigured widget is a mistake worth surfacing loudly, while asking it what it contains is reasonable and has an honest answer.

## Property upgrade

Only bites when a property is set on an element before its class registers — which happens with async script loading. The own property shadows the accessor, so the setter never runs and the value is silently ignored. Three lines on connect, only for public setters that do work. Widgets are mostly immune because their input arrives through `setup()`.

## Slots by harvest, at connect

The original rule was to ban reading light-DOM children entirely, because the parser can upgrade an element before it has read that element's children. That ban was too strong. Module scripts are deferred by the HTML spec, so a definition registers after parsing finishes and elements upgrade with children complete — which holds for every component here, since they load as ES modules. The remaining exposure is a classic blocking script registering a definition mid-parse (preventable by convention, and warned about in dev) and children appended after the host is attached (unavoidable in any design, which is what `setSlot` exists for).

Harvest sits in `connectedCallback` rather than in the render path. Deferring it until render would give widgets a slightly wider safety margin, but a widget waiting on `setup()` would leave the consumer's raw markup visible and unstyled in the meantime — `:not(:defined)` does not help, because the element is defined, just not ready. Emptying the host at connect avoids that, and keeps one rule for both kinds of component.

`#harvested` is separate from `#rendered` because for a widget they become true at different moments. Both flags exist for the same underlying reason: a DOM move re-fires `connectedCallback`, and by then the host's children are the component's own skeleton — a second harvest would eat it.

Strings enter as `textContent` and nodes are moved rather than serialized, so the "no consumer data in `html()`" rule survives slots intact. Defaults live inside the outlet in the skeleton, which means "supplied content replaces the outlet's children" needs no separate defaulting mechanism.

The dev warning keys on `document.readyState === 'loading'` rather than on "harvested nothing". The spec sets readiness to `interactive` before deferred and module scripts run, so the check identifies the dangerous case directly and also catches partial harvests, which a child-count check would miss.

## Library element before native element

The earlier form of this rule was "prefer native", which was right about the reason and wrong about the target. Composing `ui-button` rather than a bare `<button>` means styling, states, and accessibility decisions are fixed in one place for every consumer. What keeps that safe is the matching obligation: a `ui-` element wraps the native element internally rather than reimplementing it, so composing the library element still gets the platform's keyboard, focus, and role behaviour. A `ui-` element painting a `<div>` where a native control exists breaks the chain, so it is defined as a bug in that element.

The composite-widget exception is unchanged and now applies to library and native elements alike — the problem was never which element, it was any focus target inside a roving-tabindex item.

## Reflect never emits

The invariant that makes a component wireable to anything. If a `setChecked()` command emitted, a store listening to the component and feeding it back would loop. The tempting fix — tagging events with their origin and filtering — breaks one-way data flow and is forbidden in `CLAUDE.md`. The structural fix costs nothing: commands are called by someone who already knows, so they have nothing to announce.

## `html()` static only

Interpolating consumer data into an HTML string is an XSS hole and an escaping bug waiting to happen. Setting the skeleton once and then writing `textContent` is both safe and faster, and it means the skeleton is a constant that can be read at a glance.

## `cls` map, internal

The map exists so a class name can be renamed in two places (the `.css` file and the map) rather than hunted through the JS. It stays internal because exporting it makes every class name a public API that cannot be renamed without a breaking change. Apps that need to restyle get custom properties (the intended surface) and the tag plus ARIA attributes (public anyway, since they are the accessibility contract).

## CSS imported by the component

The component is then genuinely self-contained: importing it gets its styles, with no separate instruction for the app to follow and no ordering question. Vite handles the bundling.

## `:not(:defined)`

Before the tag registers, the browser treats it as an unknown inline element and paints its raw contents. One rule per component removes the flash. Cheap, and invisible when it works.

## No RTL handling

Only English and French ship, both left-to-right. Logical properties were considered and dropped as ceremony for a case that will not arise. If a right-to-left language is ever added, this is a mechanical CSS pass plus mirrored arrow keys in composite widgets — worth knowing, not worth pre-paying.

## `HTMLElement` only

Extending built-ins (`is="..."`) is unavailable in Safari, so it is out on compatibility grounds, not taste. A shared base class is deferred until several components demonstrably share plumbing — a base with one consumer is the textbook premature abstraction, and the checkbox-tree plan already documents how to keep a future extraction mechanical.

## No update-discipline section

Considered and cut: surgical-versus-rebuild is a per-component judgement, and stating it as a rule would push small dumb elements toward complexity they do not need. The two absolutes that came out of it — no `setTimeout` to wait for the DOM, no `MutationObserver` without a concrete need — survive in the anti-pattern list, because both are workarounds for a design problem rather than solutions.

## Rules that were deliberately left out

- **No id → element registry.** True and important, but it is checkbox-tree implementation detail, not a general authoring rule. The general form (do not keep a JS mirror of what the DOM holds authoritatively) is in the anti-patterns.
- **Compose rather than inherit to connect state.** Belongs to app wrappers; already in `docs/plan.md` §4.
- **No origin/source filtering.** Belongs to the store; already in `CLAUDE.md`. The component-level consequence is the reflect-never-emits rule, which is in the skill.
