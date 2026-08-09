# widget-popover — plan and tasks

Read the `web-components` skill before starting, `docs/accessibility.md` before Task 4, and `docs/regions.md` before Task 3. This file specifies only what is specific to `widget-popover`; everything else is in the skill.

> **Depends on two library components.** It composes `ui-card` for its frame and `ui-button` for its close control (skill §11: reach for a library component first). Neither may be modified to suit this widget without a note in §9.

> **Task 1 is a spike, not a build.** Whether jsdom implements the Popover API decides the shape of the test plan. Run it first; do not start Task 2 until its finding is written down.

---

## 1. Goal

A widget `<widget-popover>`: a **non-modal**, top-layer floating panel built on the platform's Popover API. It holds header / body / footer content, carries its own close button, opens and closes on command, and can be positioned against the viewport.

One component covers both foreseen uses, because they differ only in placement and payload:

- A **tool panel** over a map, opened by one of a row of buttons, statically placed by app CSS.
- A **feature popup**, opened on a map click and placed at a screen coordinate.

**Non-modal is the whole premise.** The background must stay live: the map keeps panning, the button row keeps taking clicks, and the button that opened the panel must be able to close it. Anything that must genuinely block the page is a different component built on `<dialog>.showModal()` — not a flag on this one (`docs/accessibility.md` §3.2: a component commits to one focus model and never switches by flag).

## 2. Classification

**Widget.** Strip external input and two things remain: **which element to return focus to** when it closes, and **the decision, at open time, to close its group siblings**. `toggle()` also reads current state to decide what to do. Therefore `src/lib/widgets/popover/`, `widget-` prefix.

**The open/closed state is deliberately not ours.** It lives in the platform, readable as `:popover-open`. There is no `open` property with a setter — that would be a second channel beside `show()`/`hide()` and a second source of truth to keep in sync, which is the bug `docs/accessibility.md` §7 exists to prevent. A read-only `open` getter is fine.

**No `setup()`.** Skill §5 allows it: a widget fully configurable by attributes is ready without `setup()` ever being called. This one takes no injected dependency and no required data — content arrives through regions and `setContent`, which never gate readiness. So there is no readiness gate, no `#renderIfReady`, and no `#assertReady`; commands are meaningful once connected. This is the first widget in the repo without a `setup()`, and it goes to §9.

MVVM level 2 (`docs/plan.md` §2): view-state inlined in the element, no ViewModel, no Model. There is no domain logic to extract — the only non-trivial rule is "which siblings to close", and it is three lines.

## 3. Scope

**In:** `popover="manual"` on the host; `show(source?)` / `hide()` / `toggle(source?)`; group-based auto-close; focus restoration on close; `Escape`; a close button; `positionAt(x, y)`; three content regions forwarded to a `ui-card`; a persistent `aria-live` body wrapper.

**Out — do not build, do not leave hooks for:** modal mode; a backdrop with light-dismiss; edge flipping or a pointer/arrow tail; drag-to-move; resize; animation or transition API; anchoring to an element (CSS anchor positioning); a `CustomEvent` of any kind; an `open` setter; a `destroy()`; nesting rules for popovers inside popovers; stacking order beyond what the top layer gives; RTL handling. A plain viewport boundary clamp on `positionAt` is in scope (Task 6, §10) — narrower than "collision detection": it only pulls the box back from an edge it would overflow, it never flips which side of a point the box renders on and never reacts to other elements.

**Height has two routes, and this widget uses the one that needs no card API.** `--widget-popover-max-height` caps the host; `ui-card`'s body then takes the slack and scrolls. The card also exposes `--ui-card-body-max-height` for consumers with no constrained host, which this widget does not need. See `docs/ui-card-plan-update.md`.

Two rejected alternatives worth recording, because they look obviously right:

- **`popover="auto"`.** It bundles light-dismiss, Escape, and one-at-a-time. Two of those are wrong here. Light-dismiss fires on the pointer event *before* the invoking button's `click` handler runs, so with the app wiring `button.addEventListener('click', () => overlay.toggle())` the panel closes and immediately reopens — the button becomes open-only and can never close. And a tool panel that vanishes when you click the map is not a tool panel. `manual` keeps the top layer, `:popover-open`, and `::backdrop`, and costs us Escape and focus restoration, both small and both specified below. The one-at-a-time behaviour is replaced by groups, scoped rather than global.
- **Declarative invokers (`popovertarget` on the button).** The native fix for the light-dismiss race, and unavailable: `ui-button` does not forward `popovertarget`, by its own §3. Not needed under `manual`; recorded in §9 in case `auto` is ever revisited.

## 4. Public interface

```ts
export type WidgetPopoverRegion = 'header' | 'default' | 'footer';

export class WidgetPopoverElement extends HTMLElement {
  readonly open: boolean;                      // this.matches(':popover-open')

  show(source?: HTMLElement): void;
  hide(): void;
  toggle(source?: HTMLElement): void;

  positionAt(x: number, y: number): void;      // viewport coordinates
  setContent(region: WidgetPopoverRegion, content: RegionContent): void;
}
```

Attributes: `group` and `close-label`. No properties beyond the `open` getter.

- **`show`, `hide`, `toggle` are ordinary methods, not bound fields.** The app wraps them (`() => popover.toggle()`), which is the natural way to write it and needs no help from us.
- **`source` is the element focus returns to.** Captured on `show()`/`toggle()` and used only when the popover held focus at close time (§7). Optional: a popup opened by a map click has no meaningful source.
- **`positionAt` writes custom properties, not state.** A coordinate is not state: nothing derives from it, it has no ARIA counterpart, and an attribute would thrash under repeated updates. Written as `--widget-popover-x` / `--widget-popover-y` on the host via `style.setProperty` so the placement rule itself stays in the stylesheet.
- **Static placement needs no API.** An app positions a tool panel by styling the host: `widget-popover.tools { inset: 1rem 1rem auto auto; }`. The host is public surface; what `docs/plan.md` §4 forbids is styling internal class names.
- **`setContent` never throws** and is exempt from any readiness check (skill §7). Unknown region names are ignored.

Attribute notes:

- **`group`** — not observed. It is read at the moment the popover opens, so changing it in flight simply works, and there is nothing to react to in between. Say so in a comment (skill §6).
- **`close-label`** — the accessible name of the close button, default `'Close'`. Not observed either: it is set once at build time for localisation, and the button is constructed at render.

## 5. Skeleton

```ts
html(): string {
  return `<ui-card class="${cls.card}"></ui-card>`;
}
```

That is the whole skeleton. Everything else is built as nodes and handed to the card:

- **Close button** — a `<ui-button>` created in code (icon-only, `aria-label` from `close-label`), kept as a private reference for the lifetime of the widget.
- **Header** — a `DocumentFragment` of `[consumer header content, closeButton]`, passed to `card.setContent('header', …)`. Rebuilt on every header write so the close button always survives.
- **Body** — a persistent `<div class="widget-popover__live" aria-live="polite">`, passed to `card.setContent('default', …)` **exactly once**. Consumer body content is written *inside* it (§6).
- **Footer** — passed straight through.

`popover="manual"` is set on the host in `connectedCallback`, alongside `classList.add(cls.host)` and before harvest.

**The close button is inside the header, not floating over the card.** The alternative — an absolutely positioned sibling of the card — was considered: simpler, but it overlays content, needs padding coordination, and lands last in reading and tab order. Inside the header it reads and tabs where a close control belongs. The consequence to accept: a popover with no header content still renders a header strip holding just the close button, because the close button is always header content and `ui-card` hides only genuinely empty sections.

## 6. Content regions

`regionNames = ['header', 'default', 'footer'] as const` in `widget-popover-dom.ts`, type exported from `index.ts`. Same three names as `ui-card`, and mostly a pass-through — with one region that is not.

- **`header` and `footer` forward** to the card. `header` is wrapped with the close button first.
- **`default` does not forward directly.** A live region must exist in the accessibility tree *before* its content changes, so the element carrying `aria-live` cannot be the element being replaced. `setContent('default', …)` therefore writes **into** the persistent wrapper, never over it. This is the reason the widget owns a `setContent` at all instead of delegating blindly, and it is the one place where a future maintainer will be tempted to "simplify" it back into a bug.
- **A `<ui-button>` supplied in a region survives harvest and fill** (skill §7: detach, possible teardown microtask, reattach, reconnect). The close button is built in code so it never harvests, but the consumer may put library components in the header — this gets a test.
- Standard region behaviour otherwise: repeated names merge in document order, strings enter as text, `setContent(name, '')` clears, an unclaimed harvested name is a dev error from the helper (`docs/regions.md` §5) and this widget adds no warning of its own.

**Announcement ordering.** A live region inside a `display: none` subtree is not rendered, so content set while the popover is closed is unlikely to be announced when it opens. The documented order is **`show()` first, then `setContent('default', …)`**. Confirm it in the manual screen-reader pass — `docs/accessibility.md` §11 is explicit that tests cannot.

## 7. Accessibility

APG pattern: **none, deliberately.** The platform's popover semantics already describe this element to assistive technology, and the guidance is not to layer `role="dialog"` or `aria-modal` on top of a popover — duplicated semantics are worse than none. State that in the comment at the top of the component so the absence reads as a decision.

- **No role, no `aria-modal`, no `tabindex` on the host.** Tab order runs through the content.
- **Opening never moves focus.** A panel that grabs focus on every map click is hostile, and the platform agrees: a modal dialog takes focus because it demands attention, a non-modal popover representing a notification or a persistent panel does not, even when it contains focusable elements. So: no `autofocus`, no `focus()` call in `show()`.
- **Closing restores focus only if the popover held it.** The rule in one line — restoring unconditionally yanks a user who has already moved on somewhere else back to the trigger:

  ```ts
  // on beforetoggle, newState === 'closed'
  this.#restoreFocus = this.contains(document.activeElement);
  // on toggle, newState === 'closed'
  if (this.#restoreFocus) this.#source?.focus();
  ```

  `beforetoggle` fires before the state change, while `document.activeElement` is still meaningful; `toggle` fires after, when the element is out of the top layer and focus has already fallen away. If `#source` is absent or no longer connected, do nothing and let focus land on `<body>` — documented, not patched.

  This is also what makes group auto-close correct for free: when a sibling closes, focus is on the button the user just pressed, which is *outside* the closing popover, so the guard is false and no parasitic restoration happens. One condition, both cases, no branches.
- **`Escape` closes**, handled by a `keydown` listener **on the host**. Listening on the host rather than on `document` is the whole implementation of "only when focus is inside": the event only reaches the host when it originated within it. `preventDefault()` on `Escape` only — every other key stays available to the page and to any widget inside (`docs/accessibility.md` §2).
- **The close button is icon-only**, so it carries an `aria-label` from `close-label`. `ui-button` already errors in dev when an icon-only button has no accessible name; this widget must not be the reason that fires.
- **The `aria-live` wrapper is `polite`**, never `assertive`. Feature information is not an alert.
- **Everything inside a widget nested in the popover keeps its own focus model** (`docs/accessibility.md` §3.2). The popover is layout, not coordination: it has no composite keyboard model of its own beyond `Escape`, so there is nothing to nest.

## 8. Files

```
src/lib/widgets/popover/
  widget-popover.ts
  widget-popover.css
  widget-popover-dom.ts   # cls map + regionNames
  widget-popover.test.ts
  index.ts                # WidgetPopoverElement + WidgetPopoverRegion
src/apps/sandbox/
  widget-popover.html     # demo page (Task 7)
```

Every file starts with `// AWESOME AI` (skill §14). Folder naming follows `docs/plan.md` §4's `widgets/datepicker/` example rather than `elements/ui-button/`'s full-tag folder — see §10.

---

## Task 1 — spike: does the test environment implement the Popover API?

**No production code. The output is a written finding at the top of `widget-popover.test.ts`, and a decision.**

In a throwaway test, check under jsdom: `showPopover()` / `hidePopover()` / `togglePopover()` exist and do not throw; `:popover-open` matches after showing; `beforetoggle` and `toggle` fire on the element with `oldState` / `newState`; a hidden popover's contents are not focusable.

Then take the branch that applies:

1. **Fully supported** → nothing changes. Proceed to Task 2.
2. **Partially supported** → test what works, list the gaps explicitly in the test file, and move those assertions into the manual pass (§11).
3. **Not supported at all** → add the smallest possible stub in the Vitest setup file: `showPopover` / `hidePopover` / `togglePopover` toggling an attribute that `:popover-open` can be matched against, plus the two events. Label it test infrastructure, not a polyfill — it never ships (`CLAUDE.md`: no polyfills in library code). Additionally, extract the group-sibling decision as a small exported pure function so at least that rule is asserted without a DOM (`docs/testing.md` §1).

**What not to do in any branch:** change the production design to suit the test environment. If the Popover API is the right platform feature with jsdom support, it is still the right one without it.

## Task 2 — element skeleton, card composition, rendering

Class, guarded registration, `HTMLElementTagNameMap`, `cls` map and `regionNames` in `widget-popover-dom.ts`, `html()` per §5, `connectedCallback` per skill §4 — `classList.add(cls.host)`, set `popover="manual"`, property upgrade, harvest, render — plus separate `#harvested` and `#rendered` flags. Build the close button and the live wrapper; hand both to the card. No open/close logic yet.

**Tests:** mounts and renders once; a move (remove, re-append, flush a microtask) does not re-render or re-harvest; the host carries `popover="manual"`; exactly one `ui-card` inside; the close button exists, is inside the card's header, and has an accessible name; the live wrapper exists with `aria-live="polite"`; instantiating from HTML and programmatically both work.

## Task 3 — regions, close button wiring, `setContent`

**Read `docs/regions.md` before starting this task.**

Forward `header` (rebuilt as a fragment with the close button appended) and `footer`; write `default` into the live wrapper. Stash `setContent` calls that arrive before render. Wire the close button to `hide()` — one listener, on the button, owned by this widget (the button is a dumb element and carries none of its own, skill §12).

**Tests** (`docs/testing.md` §7 applies in full, plus):

- `data-region="header"` content lands in the card's header **and** the close button is still there after it.
- `setContent('header', …)` after render replaces the content and preserves the close button.
- `setContent('default', …)` writes inside the live wrapper; the wrapper element itself is the same node before and after.
- `setContent('default', '')` clears the wrapper's contents without removing the wrapper.
- A `<ui-button>` supplied in the header region is connected and functional after render.
- Clicking the close button hides the popover; the click does not also re-dispatch anything (skill §8).
- An unknown region name passed to `setContent` is ignored without throwing; an unknown harvested name produces the helper's dev error.

## Task 4 — open, close, focus, Escape

**Read `docs/accessibility.md` before starting this task.**

`show(source?)`, `hide()`, `toggle(source?)`, the `open` getter. Capture `#source`. Wire `beforetoggle` and `toggle` on the host per §7 and put the focus logic there, not in the methods — so the invariant holds even when something calls `showPopover()` natively or the browser closes the popover on its own. `Escape` on a host `keydown`, with `preventDefault()` on that key only. Listeners via `AbortController` (skill §4).

**Tests:** `show()` opens and `open` reports true; `hide()` closes; `toggle()` does both; `show()` does **not** move focus into the popover; with focus inside, `hide()` returns focus to `source`; with focus outside, `hide()` leaves focus where it is; with no `source`, closing does not throw; with a `source` no longer connected, closing does not throw; `Escape` from inside closes and restores; `Escape` dispatched outside the popover does nothing; a key the widget does not handle is not `preventDefault`ed; a command opening the popover emits no `CustomEvent`, and consumers can observe state through the native `toggle` event on the host.

## Task 5 — groups

`group` attribute, unobserved. On `beforetoggle` with `newState === 'open'`, close open siblings sharing the group:

```ts
document.querySelectorAll(`.${cls.host}[group="${group}"]`)
```

Skipping `this`, and only those currently open. **The DOM is the registry** — no static map, nothing to register, nothing to unregister, nothing to leak, no stale entries pointing at destroyed elements, and no shared state to reset between tests. A module-level registry was the shape this came from in the previous implementation and is rejected for those reasons; `CLAUDE.md` also keeps mutable global state out of `src/lib`. Selecting by the host class rather than the tag keeps it working under inheritance (skill §10). Cost is one `querySelectorAll` per open, over a handful of elements.

**Tests:** opening a popover closes an open sibling in the same group; leaves other groups alone; leaves ungrouped popovers alone; a popover with no `group` closes nothing; changing `group` between opens takes effect immediately (this is what "unobserved" buys); closing a sibling this way does not steal focus from the button that triggered the open.

## Task 6 — CSS and positioning

`widget-popover.css`, imported by `widget-popover.ts`. Block is the full tag name.

- **`display` is set only under `:popover-open`.** The UA stylesheet hides a closed popover with `display: none`, and author styles beat the UA origin regardless of specificity — an unconditional `.widget-popover { display: block }` would leave the panel permanently visible. This satisfies skill §10's explicit-display rule while scoping it; write the reason in a comment or someone will "fix" it.
- `widget-popover:not(:defined) { display: none; }` — tag-based, the one exception to selecting by the host class. `display` rather than `ui-button`'s `visibility: hidden`, because a closed popover should occupy nothing at all; note the deviation.
- Placement reads `--widget-popover-x` / `--widget-popover-y` with fallbacks, so a popover that was never positioned still lands somewhere sane and an app can place one entirely from its own stylesheet.
- `positionAt` writes those two properties and nothing else.
- Knobs with fallbacks, named after the tag: `--widget-popover-x`, `--widget-popover-y`, `--widget-popover-width`, `--widget-popover-max-height`. Frame appearance belongs to `ui-card`'s knobs, not duplicated here.
- **`--widget-popover-max-height` caps the host, and the card does the rest.** The card's body takes the slack and scrolls, so a long feature record scrolls with nothing to configure here. Verified in the sandbox, not in a test — jsdom performs no layout (`docs/testing.md` §3).
- **`margin: 0` on the host.** The UA popover stylesheet centers an unpositioned popover via `inset: 0; margin: auto;`. Overriding only `left`/`top` leaves the UA's `right`/`bottom: 0` in place, and with `margin: auto` still active the box centers *between* the given point and the viewport's far edge instead of anchoring at it. `margin: 0` forces the over-constrained case to resolve in favor of `left`/`top`. The unpositioned fallback moved from `auto` to `1rem` for the same reason — the UA's centering trick needs `margin: auto` to work at all, and that had to be defused.
- **`show()` clamps a `positionAt`'d popover to the viewport (§10, resolved).** Boundary clamp only — never flips sides, never touches a popover placed by app CSS. Runs after `showPopover()`, since it needs real layout; unverifiable in jsdom, checked in the sandbox like the `max-height` cap above.
- **`.widget-popover__close { margin-inline-start: auto; }`** pushes the close button to the trailing edge of the card's header. This widget styles a node it created, by its own class — not the card's internals (`docs/plan.md` §4).
- `::backdrop` is available and left unstyled — under `manual` there is no light-dismiss, so a visible backdrop would promise a dismissal that does not exist.
- Low specificity, no `!important`.

**Tests:** `positionAt` sets both custom properties on the host; calling it again replaces them; **no assertion on computed layout or position** — jsdom performs no layout (`docs/testing.md` §3). Placement is verified in Task 7.

## Task 7 — sandbox demo

`src/apps/sandbox/widget-popover.html`, over a positioned background element standing in for a map. Exercise: a row of buttons wired exactly as the app will wire them (`button.addEventListener('click', () => popover.toggle())`) — the case `auto` would have broken; two popovers in one group and a third in another; one ungrouped; a header holding a real widget and a header holding plain text; a header-less popover (close button only); a body updated on a timer to watch the live region; `positionAt` driven by clicks on the background; and one popover with a deliberate `data-region` typo to see the helper's error.

Walk the keyboard manually here: Tab into an open popover, Escape closes it and focus returns to its button, Escape with focus outside does nothing, and clicking the background never closes anything.

This is where the API gets judged. If something feels awkward here, fix the design, not the demo.

## 9. Feedback to the skill

- **First widget with no `setup()`.** Skill §5 allows it in one sentence but is written as though the gate is the norm — `#renderIfReady`, `#assertReady`, "getters return safe empties" all assume it. Worth a paragraph on the shape of a widget without a gate: what replaces `#assertReady`, and whether "commands require connection" needs a stated convention.
- **The `:popover-open` display trap** (Task 6) is a platform gotcha the skill's "set an explicit `display`" rule walks straight into. One sentence in §10 would save the next person an hour.
- **`ui-button` forwards no `popovertarget`.** Not needed under `manual`, but it is the native fix for the light-dismiss race and the blocker if `auto` is ever revisited. Record it in `docs/ui-button-plan.md` §3 as a known non-hook rather than rediscovering it.
- **`ui-card` gets its first real consumer here.** Anything awkward in `setContent` — particularly the fragment-rebuild on every header write — goes back to `docs/ui-card-plan.md` §9, not around it.

## 10. Open questions

- **Widget folder naming.** `docs/plan.md` §4 shows `widgets/datepicker/`; `ui-button` shipped as `elements/ui-button/`, the full tag. This plan assumes `widgets/popover/`. Settle it once, in `docs/plan.md`, before Task 2 — it is cheap now and a rename later.
- ~~**Whether `positionAt` should clamp to the viewport.**~~ Resolved: the first user-visible bug (a feature popup opened near the right/bottom edge running off-screen) showed up during Task 7's manual pass, as predicted. `show()` now clamps — see Task 6.

## 11. Done

Per task: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

For the component overall: the checklist in `docs/accessibility.md` §10 walked with its N/As recorded, plus a manual pass — Tab reaches the popover's content and leaves it normally, Escape from inside closes and returns focus to the opening button, Escape from outside does nothing, the background stays fully interactive while a popover is open, opening a group sibling does not disturb focus, the close button announces its name, and a screen reader announces body content updated after opening.