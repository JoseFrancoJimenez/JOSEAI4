# Rationale — why the rules are what they are

Decision log — for the operator. **Agent:** open this only when the operator asks why a rule exists, or when a task proposes changing a decided rule; answer from here. Do not load it for normal tasks. The skill and the docs state the rules; this explains the reasoning so a future decision can be revisited on purpose instead of by accident.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.** This was the tiebreaker for nearly every decision below.

## No Shadow DOM

The rule is stated in `CLAUDE.md` and the skill; this is why, and what would change it.

Shadow DOM would genuinely solve four things: style encapsulation, live non-destructive slots (strictly better than harvest at the job harvest exists to do), private internals a consumer cannot wipe with `innerHTML`, and `delegatesFocus` in place of hand-written focus delegation. Those are real, and the slot advantage in particular deletes a mechanism I had to design carefully.

They are outweighed here by four costs, of which the third is decisive:

1. **Forms break.** A `<button type="submit">` inside a shadow root does not submit the outer form. Recovering it means `formAssociated` plus `ElementInternals` — machinery for something the platform currently gives free.
2. **Cross-root id references do not resolve.** `aria-labelledby="page-heading"` from the consumer cannot reach an element inside the root. ARIA element reflection fixes it, but it is newer and less obvious, and it lands precisely on the accessibility rules that already do the most work.
3. **Global CSS cannot reach inside — and ours is functional, not cosmetic.** Font Awesome and OpenLayers stylesheets are load-bearing: `icon="fa-solid fa-star"` builds an `<i>` internally, and inside a shadow root that renders blank until the sheet is adopted into every root. A per-component chore, forever, for a benefit this repo does not need.
4. Consumers lose ordinary CSS override; everything must go through custom properties or `::part`, designed up front. Tests grow a `.shadowRoot` hop.

What makes the trade acceptable is the shape of the consumers. I control the apps; nothing external queries into component DOM; apps do not need to restyle beyond custom properties. So encapsulation is defending against a threat that does not exist here, while the platform friction is paid every day.

What we accept in exchange is the unguarded host: children appended after connect render unmanaged, and a consumer's `innerHTML` can orphan cached references. That is a discipline problem, and discipline is affordable at this size. It is documented (skill §7.1) rather than guarded, because the guard is a `MutationObserver` and that is on the anti-pattern list until a concrete bug earns it.

**What would flip this:** publishing outside the team, or the first real collision between an app's CSS and a component's, or the first time something reaches into a component's DOM. The migration is survivable by design — the public contract is the tag, attributes, properties, custom properties, and events, none of which change. `cls` is deliberately internal for exactly this reason. Two habits keep the door open: apps never query or style component internals, and region names stay compatible with what a `slot` name could be.

Considered and left as a maybe: light DOM for `ui-` elements, shadow for widgets. Coherent — leaves are where forms and ARIA hurt most, widgets are where encapsulation pays — but two authoring models in one library is a real cost, and no widget has yet demonstrated the need.

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

The consumer attribute is `data-region` rather than a bare `region` or `content-region` attribute because `data-*` is the valid way to put custom attributes on arbitrary elements. The outlet marker is a distinct attribute (`data-outlet`) so consumer markup and skeleton markup can never be confused, in code or in tests. The two names are also deliberately kept short and slot-shaped, so a future migration to Shadow DOM is a rename rather than a redesign.

### Why harvest lives at connect

Deferring harvest into the render path was considered — it would widen the safety margin for widgets — but a widget waiting on `setup()` would leave the consumer's raw markup visible and unstyled in the meantime, and `:not(:defined)` cannot help because the element *is* defined, just not ready. Emptying the host at connect avoids that flash and keeps one rule for both kinds of component. `#harvested` is separate from `#rendered` because for a widget they become true at different moments; both flags exist because a DOM move re-fires `connectedCallback`, and a second harvest would swallow the component's own skeleton.

Harvest reads `childNodes` (bare text must survive — `Save` in a button is a text node) and skips whitespace-only text nodes, because pretty-printed HTML otherwise fills the default region with newlines and silently suppresses the component's default.

### Why empty outlets are hidden, not removed

Removal broke late `setContent` — the outlet was gone, so there was nowhere to put the content — and fixing that meant keeping detached references and re-inserting them: machinery. Keeping the outlet and hiding it with `:empty` costs one CSS line and keeps a permanent target. The accessibility work removal was doing is done by `aria-hidden` on decorative outlets; an empty, unlabeled span surfaces nowhere. The price is a discipline: empty outlets are written with zero inner whitespace, or `:empty` does not match.

### Why harvest counts as the first write

A literal "latest wins" breaks in one ordering: `setContent` called before the host is attached, then harvest running when the browser attaches it. The harvest is later in time, but the consumer never chose that moment — it is the browser's schedule, not theirs.

An earlier draft solved this by ranking channels (explicit `setContent` always beating harvested markup). That worked but meant two rules, and it made a plain `setAttribute` after a region assignment feel arbitrary — the consumer said "make the label this" and would have been ignored.

Treating harvest as the **first** write, whenever it physically runs, gives the same protection with one rule for orderings *in time*: it represents what was written in the markup, which logically precedes any code. Everything after it is ordinary last-writer-wins, whatever channel it came from.

One case it does not settle, and I over-claimed when I first wrote this down: a **convenience attribute that writes into an outlet** (`label="Save"` filling the label region) and a harvested region for the same outlet arrive in the same markup at the same instant, so "first" cannot separate them. The tiebreak is specificity — the region wins, because writing a child element is the more deliberate act. That is a second rule, small and only applicable at first render, and it is honest to say so rather than pretend one rule covers everything.

### Why a name no outlet claims is an error

Harvest moves content out of the host before anything knows whether an outlet wants it. If nothing claims the name, the fragment is dropped and the skeleton is written over the emptied host: the content is **destroyed with no trace**. A typo (`data-region="lable"`) and content aimed at a component that has no regions both land here.

The warning lives in the helper rather than in each component's fill step, so it is written once and a component cannot reintroduce the hole by forgetting it. That is what the optional `accepted` argument to `harvestRegions` is for — dev-only in effect, and worth one parameter because the bug it catches is invisible by construction.

### Why repeated region names merge

Two children with the same `data-region` both move into that region's fragment, in document order. Last-one-wins would discard markup the consumer wrote, which is the same silent-loss failure as above. Throwing would make a cosmetic mistake fatal. Merging is also not a special case: it is the identical append that already collects several unnamed children into `default`.

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

### Why regions are opt-in

The first draft assumed a region wherever a consumer might supply something. That is backwards. A region is the right shape only for content the component cannot express itself — arbitrary markup in a fixed area, a header, an empty-state. Where the content is a **string or a class name**, an attribute says it better: shorter to write, reflectable, observable, and free of harvest, precedence, and a `setContent` surface. Proving the region mechanism works is a reason to write a prototype, not a reason to ship an API.

So a component declares regions only when it needs them, and the ones that do not are simpler for it: no harvest, no `#harvested` flag, no first-render precedence question, no stash.

The cost is that the most natural markup a consumer will try — children between the tags — is then silently deleted at render, since the skeleton write empties the host. That is the worst of the three fates in §7.1 and the only one the helper cannot warn about, because a component with no regions never calls the helper. Hence the obligation on the component instead: if it takes no children, it says so in dev, at connect, before writing the skeleton.

### Keeping a tool ahead of its consumer

The region helper currently has no consumer. The component it was built for dropped its regions, and nothing else has needed one yet.

Deleting it would be the literal reading of the pragmatic rule, and it is the wrong call here. The rule targets *speculative abstraction* — layers invented for imagined futures. This is a finished, specified, test-pinned mechanism whose hard parts (timing, precedence, teardown of a harvested custom element) were worked out against a real component. Throwing that away means rebuilding it worse later, under time pressure, having forgotten why the edges are where they are.

That is an exception, and it is taken with eyes open rather than by drift. It comes with a trigger: if the helper is still unused when the third component ships, the judgement was wrong and it should go.

## Library element before native element

The earlier form of this rule was "prefer native", which was right about the reason and wrong about the target. Composing `ui-button` rather than a bare `<button>` means styling, states, and accessibility decisions are fixed in one place for every consumer. What keeps that safe is the matching obligation: a `ui-` element wraps the native element internally rather than reimplementing it, so composing the library element still gets the platform's keyboard, focus, and role behaviour. A `ui-` element painting a `<div>` where a native control exists breaks the chain, so it is defined as a bug in that element.

The composite-widget exception applies to library and native elements alike — the problem was never which element, it was any focus target inside a roving-tabindex item. The rule was originally motivated by a concrete bug: a native checkbox inside a roving-tabindex row created a second, competing tab order.

## Native events over custom ones

The events-up rule was originally written as "output by `CustomEvent`", which a button quietly contradicts: its inner `<button>` already produces a `click` that bubbles out of the host, because there is no shadow boundary to stop it. Re-dispatching that as `ui-button:click` would double-fire every handler and buy nothing.

So the rule now reads: a `CustomEvent` **or** a native event that already bubbles out of the host, never both for the same interaction. The "never both" clause is the load-bearing part — the failure mode is not choosing wrong, it is emitting twice.

A `CustomEvent` is still right for anything native events do not express: a semantic change (`change` with a domain payload), a composite selection, a multi-step result.

## Reflect never emits

The invariant that makes a component wireable to anything. If a state-setting command emitted, a store listening to the component and feeding it back would loop. The tempting fix — tagging events with their origin and filtering — breaks one-way data flow and is forbidden in `docs/store.md`. The structural fix costs nothing: commands are called by someone who already knows, so they have nothing to announce.

## Forwarded ARIA attributes are observed

`aria-label` on a non-focusable host is not announced, so it is copied to the inner control. Doing that only at first render made a later `setAttribute('aria-label', …)` a silent no-op — while the component's own dev error was telling consumers to set exactly that attribute. Observing the two attributes costs two entries in `observedAttributes` and keeps the HTML and JS paths symmetric, which is the stated reason `observedAttributes` exists at all.

The mirror of this: an attribute the component does *not* react to should not be observed. An attribute whose entire effect is a CSS attribute selector needs no callback — observing it is ceremony that implies a behaviour the component does not have. Leave it out, with a comment, so the absence reads as a decision rather than an oversight.

## `html()` static only

Interpolating consumer data into an HTML string is an XSS hole and an escaping bug waiting to happen. Setting the skeleton once and then writing `textContent` is both safe and faster, and it means the skeleton is a constant that can be read at a glance.

## `cls` map, internal; block = full tag

The map exists so a class name can be renamed in two places (the `.css` file and the map) rather than hunted through the JS. It stays internal because exporting it makes every class name a public API that cannot be renamed without a breaking change. Apps that need to restyle get custom properties (the intended surface) and the tag plus ARIA attributes (public anyway, since they are the accessibility contract).

The block is the full tag name, prefix included, because class names are global in light DOM: `.button` or `.day` will eventually collide with app CSS, `.ui-button__icon` cannot. The earlier convention (tag without prefix) had exactly that collision built in.

## The focus ring is a shared token

Two tiers of custom property were already the rule: shared `--ui-*` tokens for what must look identical across components, per-component knobs named after the tag for the rest. The focus ring is the clearest possible case for tier one — a ring that differs between a button and a listbox is a bug.

The temptation is to hardcode it in the first component that needs one, on the grounds that a token file is over-engineering for a single consumer. That reasoning smuggles in a false premise: a shared token is a **name plus a fallback**, not a file. `var(--ui-focus-ring, 2px solid …)` costs nothing more than the literal it replaces, works before any theme exists, and is the only thing that makes the ring consistent once a second component appears. Deciding a shared value per component is how a design system stops being one.

## CSS imported by the component

The component is then genuinely self-contained: importing it gets its styles, with no separate instruction for the app to follow and no ordering question. Vite handles the bundling.

## `:not(:defined)`

Before the tag registers, the browser treats it as an unknown inline element and paints its raw contents. One rule per component removes the flash. Cheap, and invisible when it works.

## No RTL handling

Only English and French ship, both left-to-right. Logical properties were considered and dropped as ceremony for a case that will not arise. If a right-to-left language is ever added, this is a mechanical CSS pass plus mirrored arrow keys in composite widgets — worth knowing, not worth pre-paying.

## `HTMLElement` only

Extending built-ins (`is="..."`) is unavailable in Safari, so it is out on compatibility grounds, not taste. A shared base class is deferred until several components demonstrably share plumbing — a base with one consumer is the textbook premature abstraction.

## No update-discipline section

Considered and cut: surgical-versus-rebuild is a per-component judgement, and stating it as a rule would push small dumb elements toward complexity they do not need. One absolute came out of it and survives — no `setTimeout` to wait for the DOM, which is always a workaround for an ordering problem that has a real answer.

## `MutationObserver` is a tool, not an anti-pattern

It was originally listed beside `setTimeout` as banned-without-a-concrete-need, and that was overreach. The two are not alike: `setTimeout` guesses at timing, while a `MutationObserver` observes something that genuinely happened. What made the ban feel right was the case that prompted it — using one to police children a consumer should not have been adding, which is a design problem wearing a detection costume.

The honest rule is narrower: **do not observe what an explicit channel already tells you.** A property, a command, or an observed attribute is cheaper, synchronous, and typed. But a component that must react to DOM it does not control has no such channel, and a container whose consumer adds or removes children at runtime is exactly that. Forbidding the observer there would push the design toward a worse answer — a manual `refresh()` the consumer has to remember, which is the "one more thing to forget" the no-`destroy()` rule already rejects.

So: allowed, with a comment saying why, and with the narrowest config that does the job.

The stray-child problem stays unguarded regardless. An observer would catch children appended after connect, but no bug has been caused by it yet and documentation is enforceable at this team size. That is a judgement about need, no longer about permission.

## Toggle state lives on the button, not in a subclass

An exclusive-selection group needs its buttons to carry pressed state. Two shapes were considered: a `pressed` property on the existing button, or a `ui-toggle-button` inheriting from it.

Inheritance is not forbidden here — the standing rule is compose to connect state, inherit to specialize behaviour, and a toggle is a specialization. It loses on cost. Custom elements have no inheritance of definitions, so a subclass means a second tag, a second file, a second entry in the tag-name map, and either duplicated CSS or a host carrying two class names. The parent's element references are `#private`, so the subclass cannot reach the inner control without a protected getter — which contradicts the deliberate decision not to expose one. And the render is guarded by a `#rendered` flag, so the subclass needs a lifecycle hook and an ordering contract between parent and child.

That is a lot of surface for one boolean and one ARIA attribute. The rule against a base class with one consumer applies in mirror: a subclass that only adds a field is the same premature abstraction seen from below. There is also a consumer cost — a second tag forces the choice at markup-writing time, where an attribute lets the same element become a toggle later without a rewrite.

Inheritance stays available for a toggle that genuinely diverges: different skeleton, different keyboard model, different event. This one does not diverge.

## Why the host cannot simply take the role

The recurring suggestion is to put `role="button"` on the host and skip forwarding ARIA inward. It does not work, and the reason is worth keeping written down because the idea returns.

A role on the host does not replace the inner native control — it wraps it. A screen reader then finds a button containing a button, announces twice, and a containing widget's item count doubles. Making the host usable would need `tabindex="0"`, which creates a second tab stop, which forces `tabindex="-1"` on the inner control, at which point Enter and Space, `disabled`, and form submission all stop working and must be reimplemented. That is the definition of the bug in the composition rule: painting a control where a native one exists.

The genuine alternative is the opposite — no inner control, the host *is* the button — and it costs exactly the platform behaviour listed above. It is the right answer only when no native element fits. So ARIA forwarding is not a patch; it is the price of keeping the native control, and a declared list makes it one loop rather than one branch per attribute.

## Keyboard follows the eye, not the DOM

Where a component supports a reversed layout, arrow keys, `Home`, and `End` move in **visual** order, so a right arrow always moves focus rightward.

The alternative — always advancing in DOM order — is simpler to implement and wrong for the user, who sees focus jump left when pressing right. The cost of doing it properly is a sign flip inside a pure function that already receives the orientation, which is close to nothing.

`Home` and `End` were briefly given the opposite treatment, on the argument that they mean "start and end of the list" rather than "left and right edge". Consistency won: one rule for every movement key is easier to hold than one rule with an exception, and the user's model of the widget is what they can see.

The obligation this creates: the component owns the CSS that reverses the axis, driven by its own attribute. An external stylesheet flipping `flex-direction` behind the component's back desynchronises keyboard from layout silently, and nothing can detect it.

## The `AWESOME AI` first line

A read-receipt, not a runtime concern. Its presence at the top of a component file says the file was written against the skill rather than from memory — the same job the "first words" rule does for a session, in a place that survives into the diff. It cost me a false-positive review comment once (flagged as leftover cruft by something that had not read §14), which is evidence it works: an unexplained marker invites deletion, so the skill now says what it is for.

## Rules that were deliberately left out

- **No id → element registry.** True and important in the widget plan where it arose, but it is implementation detail of that widget, not a general authoring rule. The general form (do not keep a JS mirror of what the DOM holds authoritatively) is covered by the anti-patterns.
- **Compose rather than inherit to connect state.** Belongs to app wrappers; lives in `docs/store.md` §4.
- **No origin/source filtering.** Belongs to the store; lives in `docs/store.md` §2. The component-level consequence is the reflect-never-emits rule, which is in the skill.
- **Type-checking harvested children.** Restricting a region to certain element types was considered and dropped: the failure is rare, self-evident when it happens, and it would add per-component configuration to a helper that is currently pleasantly dumb. The one case where child type genuinely matters — composite widget items — is already closed structurally by taking strings.
