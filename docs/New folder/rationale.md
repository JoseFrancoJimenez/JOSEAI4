# Rationale — why the rules are what they are

For me, not for the agent. `SKILL.md` states the rules; this explains the reasoning so a future decision can be revisited on purpose instead of by accident.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.** This was the tiebreaker for nearly every decision below.

## Classification and prefixes

`ui-` vs `widget-` makes the dumb/smart split visible in the markup, so a review can spot a UI element that has quietly grown state. A widget's own dumb sub-elements (a row, a cell) are UI elements even though only that widget uses them — dumbness is about the contract, not about reuse.

## Registration as a module side effect

Chosen over an exported `defineFoo()` because a component must be declarable in HTML: `<widget-foo>` in markup has to work as soon as the module is imported, with nothing to remember to call. The `customElements.get` guard exists because test files import the same module many times and a second `define` throws.

The ES-module loading requirement is not a tooling preference: module scripts are deferred by the HTML spec, so definitions register after parsing and elements upgrade with their children complete. That guarantee is what makes region harvesting sound; a classic blocking script would break it.

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

Commands throw, getters return empties: calling a command on an unconfigured widget is a mistake worth surfacing loudly, while asking it what it contains is reasonable and has an honest answer.

Region content never gates readiness because regions are optional presentation — a widget that cannot render without its icon has misclassified the icon as data.

## Property upgrade

Only bites when a property is set on an element before its class registers — which happens with async script loading. The own property shadows the accessor, so the setter never runs and the value is silently ignored. Three lines on connect, only for public setters that do work. Widgets are mostly immune because their input arrives through `setup()`.

## Content regions

### Why not "slots"

The mechanism is harvest-and-replace, and it differs from Shadow-DOM slots in two ways that the platform name would paper over: supplied nodes are *moved* into the skeleton rather than projected (ownership transfers; the consumer's markup is no longer where they wrote it), and capture is *one-time* (no live reassignment, no `slotchange`). Calling them slots would import expectations the mechanism does not meet. "Content region" describes what it actually is: a named, fixed area a consumer can fill.

The consumer attribute is `data-region` rather than a bare `region` or `content-region` attribute because `data-*` is the valid way to put custom attributes on arbitrary elements. The outlet marker is a distinct attribute (`data-outlet`) so consumer markup and skeleton markup can never be confused, in code or in tests.

### Why harvest lives at connect

Deferring harvest into the render path was considered — it would widen the safety margin for widgets — but a widget waiting on `setup()` would leave the consumer's raw markup visible and unstyled in the meantime, and `:not(:defined)` cannot help because the element *is* defined, just not ready. Emptying the host at connect avoids that flash and keeps one rule for both kinds of component. `#harvested` is separate from `#rendered` because for a widget they become true at different moments; both flags exist because a DOM move re-fires `connectedCallback`, and a second harvest would swallow the component's own skeleton.

Harvest reads `childNodes` (bare text must survive — `Save` in a button is a text node) and skips whitespace-only text nodes, because pretty-printed HTML otherwise fills the default region with newlines and silently suppresses the component's default.

### Why empty outlets are hidden, not removed

Removal broke late `setContent` — the outlet was gone, so there was nowhere to put the content — and fixing that meant keeping detached references and re-inserting them: machinery. Keeping the outlet and hiding it with `:empty` costs one CSS line and keeps a permanent target. The accessibility work removal was doing is done by `aria-hidden` on decorative outlets; an empty, unlabeled span surfaces nowhere. The price is a discipline: empty outlets are written with zero inner whitespace, or `:empty` does not match.

### Why explicit beats harvested

"Last writer wins" sounded simple but contradicts itself when `setContent` runs before the host is attached and harvest runs after — later in time is the harvest, more explicit is the call. Precedence by *kind* (explicit `setContent` over harvested markup, latest among explicit calls) is unambiguous in every ordering.

### Why the default region is named `default`

An anonymous default (`data-outlet=""`) left `setContent` with no way to address it and made the empty-string-vs-missing distinction load-bearing. Naming it costs one word and removes the ambiguity.

### Why `setContent` is not a command

Commands operate on a configured widget, so they throw before `setup()`. `setContent` *provisions input*, like an attribute — it must be callable at any time, in any order, from either instantiation path. Making it throw would reintroduce the ordering coupling that `setup()` exists to remove. So it stashes before render and applies after.

### Why regions are only for fixed, singular areas

Harvest is host-level and one-time, so per-item content (rows, options) structurally cannot be regions. Repeated content goes through render callbacks. In composite widgets the callback returns *strings only*: a string cannot carry a tab stop, which closes the focusable-content-inside-items problem at the type level instead of policing consumer nodes.

### Region components and teardown

A custom element harvested into a region genuinely disconnects, and for a widget host it can stay detached until `setup()` arrives — long past the microtask. Its teardown legitimately runs; the fill step reattaches it and connect runs again. Rather than fight this, the design leans on the lifecycle rules already in place: idempotent connect and symmetric teardown make a full disconnect/reconnect cycle survivable by construction.

### The dev warning

Keys on `document.readyState === 'loading'` rather than "harvested nothing", because the spec sets readiness to `interactive` before deferred and module scripts run — so the check identifies the dangerous case (a definition registered mid-parse by a blocking script) directly, and also catches partial harvests, which a child-count check would miss. It lives in the shared helper, written once.

## Library element before native element

The earlier form of this rule was "prefer native", which was right about the reason and wrong about the target. Composing `ui-button` rather than a bare `<button>` means styling, states, and accessibility decisions are fixed in one place for every consumer. What keeps that safe is the matching obligation: a `ui-` element wraps the native element internally rather than reimplementing it, so composing the library element still gets the platform's keyboard, focus, and role behaviour. A `ui-` element painting a `<div>` where a native control exists breaks the chain, so it is defined as a bug in that element.

The composite-widget exception applies to library and native elements alike — the problem was never which element, it was any focus target inside a roving-tabindex item. The rule was originally motivated by a concrete bug: a native checkbox inside a roving-tabindex row created a second, competing tab order.

## Reflect never emits

The invariant that makes a component wireable to anything. If a state-setting command emitted, a store listening to the component and feeding it back would loop. The tempting fix — tagging events with their origin and filtering — breaks one-way data flow and is forbidden in `docs/store.md`. The structural fix costs nothing: commands are called by someone who already knows, so they have nothing to announce.

## `html()` static only

Interpolating consumer data into an HTML string is an XSS hole and an escaping bug waiting to happen. Setting the skeleton once and then writing `textContent` is both safe and faster, and it means the skeleton is a constant that can be read at a glance.

## `cls` map, internal; block = full tag

The map exists so a class name can be renamed in two places (the `.css` file and the map) rather than hunted through the JS. It stays internal because exporting it makes every class name a public API that cannot be renamed without a breaking change. Apps that need to restyle get custom properties (the intended surface) and the tag plus ARIA attributes (public anyway, since they are the accessibility contract).

The block is the full tag name, prefix included, because class names are global in light DOM: `.button` or `.day` will eventually collide with app CSS, `.ui-button__icon` cannot. The earlier convention (tag without prefix) had exactly that collision built in.

## CSS imported by the component

The component is then genuinely self-contained: importing it gets its styles, with no separate instruction for the app to follow and no ordering question. Vite handles the bundling.

## `:not(:defined)`

Before the tag registers, the browser treats it as an unknown inline element and paints its raw contents. One rule per component removes the flash. Cheap, and invisible when it works.

## No RTL handling

Only English and French ship, both left-to-right. Logical properties were considered and dropped as ceremony for a case that will not arise. If a right-to-left language is ever added, this is a mechanical CSS pass plus mirrored arrow keys in composite widgets — worth knowing, not worth pre-paying.

## `HTMLElement` only

Extending built-ins (`is="..."`) is unavailable in Safari, so it is out on compatibility grounds, not taste. A shared base class is deferred until several components demonstrably share plumbing — a base with one consumer is the textbook premature abstraction.

## No update-discipline section

Considered and cut: surgical-versus-rebuild is a per-component judgement, and stating it as a rule would push small dumb elements toward complexity they do not need. The two absolutes that came out of it — no `setTimeout` to wait for the DOM, no `MutationObserver` without a concrete need — survive in the anti-pattern list, because both are workarounds for a design problem rather than solutions.

## Rules that were deliberately left out

- **No id → element registry.** True and important in the widget plan where it arose, but it is implementation detail of that widget, not a general authoring rule. The general form (do not keep a JS mirror of what the DOM holds authoritatively) is covered by the anti-patterns.
- **Compose rather than inherit to connect state.** Belongs to app wrappers; lives in `docs/store.md` §4.
- **No origin/source filtering.** Belongs to the store; lives in `docs/store.md` §2. The component-level consequence is the reflect-never-emits rule, which is in the skill.
