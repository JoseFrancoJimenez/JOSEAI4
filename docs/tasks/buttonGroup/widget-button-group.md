# widget-button-group — plan and tasks

Read the `web-components` skill and `docs/accessibility.md` before starting. This file specifies only what is specific to the group.

Depends on `ui-button` having `pressed`, `value`, and the `--ui-button-radius` knob (`ui-button-plan.md` §4, Task 3).

> **The name is the child contract.** A button group takes `ui-button`s — including widgets that extend `UiButtonElement` under their own tag — and nothing else.

---

## 1. Goal

A row (or column) of consumer-supplied `ui-button`s, of which **at most one is active**. Clicking the active one deactivates it, leaving none. The group owns which is active and groups the buttons visually.

Consumer experience: declare `<widget-button-group aria-label="…">`, drop `ui-button`s in, done. No `setup()`, no wiring.

## 2. Classification

**Widget.** Strip external input and the active value remains — it holds state and decides what happens on activation. Therefore `widget-` prefix, `src/lib/widgets/button-group/`.

The `widget-` prefix on something that is also a visual container reads slightly oddly. It is correct: the rule exists so an element with state cannot pass as dumb.

## 3. Scope

**In:** consumer-supplied `ui-button` children (subclasses included); exclusive selection with deselect; `orientation` (`horizontal` | `vertical`); visual grouping; a change event.

**Out — do not build, do not leave hooks for:** a roving-tabindex/toolbar keyboard model (§11); reversed orientations; multi-select mode; a non-exclusive "just group them visually" mode; items generated from data; content regions; nested groups; non-`ui-button` children of any kind — a bare native `<button>` included (the skill funnels buttons through `ui-button`, so accepting a raw one would add a second state channel and a second CSS route for a population this library does not produce); disabled-group (disable the buttons); RTL.

## 4. Accessibility

**No APG composite pattern. This is a `role="group"` of ordinary buttons in natural tab order** — the "no pattern at all" case in `docs/accessibility.md` §1. The group adds no keyboard model: each button is its own Tab stop and the `ui-button`'s inner native `<button>` handles Enter and Space.

- **`role="group"` on the host**, with a **required accessible name**: forward `aria-label` / `aria-labelledby`, and `console.error` in dev when neither is present (`docs/accessibility.md` §4).
- **No `aria-orientation`** — not supported by `group`; `orientation` here is presentation only.
- **No `tabindex` written by the group, ever**, on the host or on a child. One on the host would create a Tab stop in front of the buttons.
- **State goes through the `pressed` property**, never ARIA on a child. Setting `el.pressed = true` lets `ui-button` write `aria-pressed` on its own inner control — the sanctioned channel: expose a property on the item and call it, never touch its internals (`docs/accessibility.md` §5). The group never writes ARIA onto its children.
- **Presence semantics:** the active child carries `aria-pressed="true"` (via `pressed`); an inactive child has no `aria-pressed` at all, matching `ui-button`'s own rule. Accepted trade: inactive members announce as plain buttons rather than "not pressed" toggles. The manual pass (§10) verifies it reads acceptably; if not, the fix is an explicit false state on `ui-button` through §9, not a workaround here.
- **Toggles, not radios.** The set can end up with nothing selected, which is what makes `aria-pressed` correct here rather than a radiogroup (`docs/accessibility.md` §4).

The trade this accepts: N buttons are N Tab stops. Right default at button-group size; the upgrade path if density ever hurts is §11.

## 5. Public interface

```ts
export type ButtonGroupOrientation = 'horizontal' | 'vertical';

export class ButtonGroupElement extends HTMLElement {
  orientation: ButtonGroupOrientation;         // ↔ 'orientation'  default 'horizontal'
  readonly activeValue: string | null;
  readonly activeButton: UiButtonElement | null;   // convenience; not the identity channel

  setActive(value: string | null): void;       // reflect; does not emit
}
```

**No `setup()`.** Everything arrives as children plus one attribute, so it is ready on connect (skill §5 — attributes can satisfy readiness). Both getters return `null` before anything is selected, which is the honest empty.

`setActive` is a command: it writes `pressed` on the children and **does not emit** (`docs/rationale.md`, reflect never emits). An unknown value clears the selection rather than throwing — it is the same statement as `null`.

## 6. Event

```ts
'widget-button-group:change'   detail: { value: string | null }
```

- Emitted **only** on a user gesture — click, or Enter/Space, which the native button turns into a click.
- `value: null` on deselect.
- `bubbles: true`.
- **`detail` carries the value, never the element** (skill §8: plain serializable data). `activeButton` is there for the consumer that wants the node.
- **The native `click` keeps bubbling out of the group as well.** Two events per gesture, expressing different things: "this button was clicked" and "the selection changed". This is not the double-dispatch the skill forbids — that is re-emitting the *same* interaction under a new name — but it must be documented and tested, because a consumer listening to both will be called twice.

## 7. Children and how they are read

- **A child counts if `child instanceof UiButtonElement`.** `instanceof`, not tag matching (`closest('ui-button')` or a `ui-button` selector) — a subclass registered under a different tag is still a `UiButtonElement` and must count, which the inheritance rules deliberately allow (`docs/rationale.md`). This is the whole reason the group accepts "widgets that extend `ui-button`" for free. Anything else is ignored for selection, with a dev-only warning naming the tag.
- Children are read from the DOM **per operation**, not cached at connect — cheap for a handful of buttons, correct if the consumer adds or removes one. No value → element map (`docs/rationale.md`: no JS mirror of what the DOM holds authoritatively).
- **Identity is `value`** — `ui-button`'s reflecting property. A child without one cannot be selected: dev-only error. Duplicate values are also a dev error — the first match would win silently otherwise.
- **Delegation resolves to the direct child, never by `closest('button')`.** A click inside a `ui-button` would `closest`-match its **inner control** first. Walk from `event.target` up to the node whose parent is the host, then apply the `instanceof` check. A click on a non-`ui-button` child resolves to nothing and does nothing.
- **A disabled child cannot be activated** — `ui-button`'s native `disabled` blocks the click before it reaches the delegated handler. Free.
- **Children removed at runtime:** with no tab stop to maintain, the only stale thing is `activeValue` naming a value nobody carries. Resolve it lazily — the getters check against current children and report `null`. **No `MutationObserver`** (skill §12): there is no state to recompute eagerly. Revisit only if a real bug appears.

## 8. CSS

- Host: `display: flex`, `flex-direction` from `orientation` — `row` or `column`.
- **The group owns the axis CSS**, driven by its own attribute; an app must never flip the direction from outside (`docs/accessibility.md` §2).
- Visual grouping (shared borders, corners only at the ends) keys off `:first-child` / `:last-child`, sound because nothing reverses the visual order. Corners route through the **public knob**: `.widget-button-group > :first-child { --ui-button-radius: … }` (and `:last-child`). Setting the property on any child is harmless — only a `ui-button` consumes it — so this is subclass-proof without naming a tag, and never reaches an internal class (`docs/plan.md` §4).
- Block is the full tag name: `.widget-button-group`.
- `widget-button-group:not(:defined) { visibility: hidden; }`.
- Per-component knobs (e.g. `--widget-button-group-gap`), each with a fallback.

---

## Task 1 — element, role, name, child validation

Class, registration, tag map, `cls` map, `role="group"`, `orientation` property and attribute, ARIA name forwarding with the dev warning, and the dev-only child checks (§7): non-`ui-button` child, missing `value`, duplicate `value`. No skeleton to render — the children *are* the content.

**Tests:** `role="group"` present; no `aria-orientation`; no `tabindex` anywhere on host or children; `orientation` reflects both ways; a move (remove, re-append, flush) does not double-subscribe; missing accessible name warns; a `<div>` child warns and is ignored; a child without `value` warns; duplicate values warn.

## Task 2 — selection

Delegated `click` on the host with the direct-child walk (§7). Exclusivity, deselect, `setActive`, the two getters, the change event.

**Tests:** clicking an inactive button activates it (`pressed` true) and deactivates the previous; a click inside a `ui-button` resolves to it, not to its inner control; clicking the active one deactivates it and emits `{ value: null }`; the event fires **once** per gesture with the right value; `setActive` reflects and does **not** emit; `setActive` with an unknown value clears; the native `click` still reaches a listener on the group's parent; both getters return `null` before any selection; a disabled button cannot be activated; Enter and Space on a focused button select it (native activation, no extra code); removing the active child leaves the getters at `null`; **a `UiButtonElement` subclass registered under a different tag participates fully** — counts, selects, emits its `value`.

## Task 3 — CSS

Per §8, both orientations, corner and shared-border logic through the `--ui-button-radius` knob.

## Task 4 — sandbox demo

`src/apps/sandbox/button-group.html`: both orientations; icon-only buttons with `aria-label`; one disabled button in the middle; a group with none selected initially; a programmatic `setActive`; a listener logging both the change event and the native click. If a `ui-button` subclass exists by now, include one to prove it participates.

This is where the API gets judged. If something feels awkward here, fix the design, not the demo.

## 9. Feedback

Likely candidates to send back into the docs: whether the two-events-per-gesture rule needs a stronger statement in the skill; whether absent-`aria-pressed` on inactive members confuses a real screen reader (which would motivate an explicit false state on `ui-button`); whether N Tab stops is felt as a problem in the demo (§11).

## 10. Done

Per task: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

Overall: `docs/accessibility.md` §10 checklist walked, plus a manual pass — Tab reaches each button and leaves, Enter and Space activate, the active button is announced as pressed, the group announces its name, and a disabled child is skipped.

## 11. If the toolbar model is ever needed

Deferred on purpose, not overlooked: the composite alternative is one Tab stop with arrow-key navigation (APG **Toolbar**), which trades work for keyboard density. Only worth it if a real app has a group with enough buttons that tabbing through them is felt, or one living inside an already dense toolbar.

The upgrade is **additive**: `ui-button` gains a `tabStop` property writing `tabindex="0" | "-1"` on its inner control (a property, never a forwarded attribute — a `tabindex` left on the host would create the second Tab stop the design avoids). The group gains `role="toolbar"`, `aria-orientation`, `keydown`/`focusin` delegation, and a pure `resolveMove({ count, current, disabled, key, orientation })` function holding the whole keyboard contract. Nothing in §5 or §6 changes.

Reversed orientations belong to that same future: they exist to justify "movement follows the eye" (`docs/rationale.md`), which is a keyboard rule and therefore meaningless while there is no keyboard model.

## 12. A note on child typing

Considered: a `ButtonGroupItem` interface (`value`, `disabled`, `pressed`) as the child contract instead of `UiButtonElement`. Dropped for now — TypeScript interfaces erase at compile time, so the runtime gate is `instanceof` regardless, and in this library every button is a `ui-button` by the skill's composition rule, so the interface would widen the type to a population of zero. If a button-like element that genuinely cannot extend `UiButtonElement` ever appears (a composition wrapper, say), the additive upgrade is a brand symbol the element declares plus an `instanceof || brand` gate — named here so the door stays open on purpose.