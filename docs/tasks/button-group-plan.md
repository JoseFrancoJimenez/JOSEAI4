# widget-button-group — plan and tasks

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.**

Read `.claude/skills/web-components/SKILL.md` and `accessibility.md` before starting. This file specifies only what is specific to the group.

Depends on `button-modification-plan.md` — the group cannot be built until `ui-button` has `pressed`.

---

## 1. Goal

A segmented control: a row (or column) of `ui-button`s supplied by the consumer, of which **at most one is active**. Clicking the active one deactivates it, leaving none. The group owns which is active, groups the buttons visually, and provides one Tab stop with arrow-key navigation.

## 2. Classification

**Widget.** Strip external input and the active index remains — it holds state and decides what happens on activation. Therefore `widget-` prefix, `src/lib/widgets/button-group/`, and a `setup()` gate if it needs one (§5 says it does not).

The `widget-` prefix on something that is also a visual container reads slightly oddly. It is correct: the rule exists so an element with state cannot pass as dumb.

## 3. Scope

**In:** consumer-supplied `ui-button` children; exclusive selection with deselect; `orientation` with four values; toolbar keyboard model; visual grouping; a change event.

**Out — do not build, do not leave hooks for:** multi-select mode; a non-exclusive "just group them visually" mode; items generated from data; content regions; nested groups; `ui-button`s mixed with other controls; disabled-group (disable the buttons); RTL.

## 4. Accessibility

APG pattern: **Toolbar**.

- **`role="toolbar"` on the host.** The widget behaves as one Tab stop with arrow navigation, so it must say so; loose buttons announced individually would contradict the interaction (`accessibility.md` §4).
- **Accessible name required.** Forward `aria-label` / `aria-labelledby`; `console.error` in dev when neither is present. An unnamed toolbar announces as noise.
- **`aria-orientation`** reflects `horizontal` or `vertical`. The reversed variants report their base axis — reversal is presentation and ARIA does not describe it.
- **Items are the controls**, so real `<button>`s inside items are correct here — this is the allowed half of `accessibility.md` §3.1, not an exception to it.
- **State lives on the buttons** as `aria-pressed`, written by `ui-button` through its `pressed` property. The group never writes ARIA onto its children (§5 of the same file).
- Roving tabindex: exactly one child with `tabindex="0"` after every operation.

## 5. Public interface

```ts
export type ButtonGroupOrientation =
  | 'horizontal' | 'horizontal-reversed'
  | 'vertical'   | 'vertical-reversed';

export class ButtonGroupElement extends HTMLElement {
  orientation: ButtonGroupOrientation;      // ↔ 'orientation'  default 'horizontal'
  readonly active: UiButtonElement | null;

  setActive(button: UiButtonElement | null): void;   // reflect; does not emit
}
```

**No `setup()`.** Everything it needs arrives as children plus one attribute, so it is ready on connect (skill §5 — attributes can satisfy readiness). `active` returns `null` before anything is selected, which is the honest empty.

`setActive` is a command: it updates `pressed` on the children and the roving tab stop, and **does not emit** (`rationale.md`, reflect never emits).

## 6. Event

```ts
'widget-button-group:change'  detail: { button: UiButtonElement | null }
```

- Emitted **only** on a user gesture — click or keyboard activation.
- `button: null` on deselect.
- `bubbles: true`.
- **The native `click` from the button keeps bubbling out of the group as well.** Two events per gesture, expressing different things: "this button was clicked" and "the group's selection changed". This is not the double-dispatch the skill forbids, which is re-emitting the *same* interaction under a new name — but it must be documented and tested, because a consumer listening to both will be called twice.

## 7. Keyboard contract

The specification the tests assert against. Movement is always in **visual** order.

| Key | `horizontal` / `vertical` | `*-reversed` |
|---|---|---|
| `→` (horizontal) / `↓` (vertical) | next enabled in DOM | previous enabled in DOM |
| `←` (horizontal) / `↑` (vertical) | previous enabled in DOM | next enabled in DOM |
| `Home` | first DOM child | last DOM child |
| `End` | last DOM child | first DOM child |
| `Tab` / `Shift+Tab` | leaves the group | leaves the group |
| `Space` / `Enter` | activates — handled by the native `<button>`, the group does not intervene | same |

- **Off-axis arrows are not handled** and not `preventDefault`ed — a vertical group leaves `←`/`→` to the page, and vice versa.
- **Arrows never activate.** Movement and activation are separate.
- **No wraparound.** At the visual first or last, the key does nothing.
- **Disabled children are skipped** — a native `<button disabled>` cannot take focus (`accessibility.md` §9).
- `preventDefault()` only on the keys the group handles, and only when a move actually results.

### Boundaries

- Visual first / last: no move, nothing else happens.
- One enabled child: every movement key is a no-op.
- No enabled children, or no children at all: nothing carries `tabindex="0"` and the group is outside the tab order. A defined state, not a crash.
- The child holding the tab stop becomes disabled → recompute the tab stop.
- `orientation` changes at runtime → focus and tab stop unchanged, only which keys respond.

### Tab stop

- Initial: the **visually first** enabled child, or the pressed one if there is one.
- Follows focus on arrow/Home/End.
- Synced on `focusin`, so mouse and keyboard agree.
- Leaving and re-entering with Tab returns to the last focused child, not the first.

## 8. Architecture

**The movement rule is a plain class, no DOM** (`plan.md` §2, §3):

```ts
// resolve-move.ts
export function resolveMove(input: {
  count: number;
  current: number;
  disabled: readonly boolean[];
  key: string;
  orientation: ButtonGroupOrientation;
}): number | null;   // target index, or null = do nothing (wrong axis, or boundary)
```

Every row of the table and every boundary above is tested here, instantiated directly, no mounting. The element is left with: read the key, ask for an index, focus that child, move the tab stop. `null` is also what tells it not to `preventDefault`.

This is the piece that keeps the accessibility work from spreading through the component — the element stays small because the edge cases live somewhere they can be tested cheaply.

## 9. Children and how they are read

- The group reads its `ui-button` children from the DOM. It keeps **no id → element map** (`rationale.md`: no JS mirror of what the DOM holds authoritatively).
- **Identification is by position** for internal computation; the event carries the element itself, so a consumer never depends on an index.
- Children are read **per operation**, not cached at connect — cheap for a handful of buttons, and correct if the consumer adds or removes one.
- **Children added or removed at runtime:** the group must recompute the tab stop, and clear `active` if the active child is gone. Since the consumer owns the children, there is no explicit channel for this, which is the case where a `MutationObserver` is legitimate (skill §12) — `childList` on the host only, no `subtree`. **Decide during Task 1** whether that is needed now or whether reading per operation is sufficient; do not add it speculatively.
- A non-`ui-button` child is ignored for selection and navigation. Dev-only warning naming the tag.

## 10. CSS

- Host: `display: flex`, `flex-direction` from `orientation` — `row`, `row-reverse`, `column`, `column-reverse`.
- **The component owns the axis CSS.** It is driven by its own attribute so keyboard and layout cannot drift apart (`accessibility.md` §2). An app must never flip the direction from outside.
- Visual grouping (shared borders, rounded corners only at the ends) **cannot key off `:first-child` / `:last-child` alone**, because reversal moves the visual ends. Use the orientation attribute selector to pick which child gets which corner.
- Block is the full tag name: `.widget-button-group`.
- `widget-button-group:not(:defined) { visibility: hidden; }`.
- Per-component knobs (e.g. `--widget-button-group-gap`), each with a fallback.

---

## Task 1 — `resolve-move.ts`

The pure movement function. Build it first; it is the whole keyboard contract and needs no DOM.

**Tests:** every row of §7 across all four orientations; both boundaries; disabled skipped, including runs of consecutive disabled; one enabled; none enabled; empty; off-axis keys return `null`; `Home`/`End` in reversed orientations.

**Done:** tests, typecheck, lint green.

## Task 2 — element skeleton, role, and children

Class, registration, tag map, `cls` map, `role="toolbar"`, `aria-orientation`, `orientation` property and attribute, ARIA name forwarding with the dev warning. No skeleton to render — the children *are* the content — so this is mostly connect-time setup and the initial tab stop.

**Tests:** role and `aria-orientation` present and correct per orientation; exactly one child has `tabindex="0"` on connect; a move (remove, re-append, flush) does not double-subscribe; missing accessible name warns in dev; a non-`ui-button` child warns and is skipped.

## Task 3 — keyboard and focus

Delegate `keydown` and `focusin` at the container. Wire `resolveMove`. Move focus, move the tab stop, `preventDefault` only when a move happened.

**Tests:** the §7 table driven through real `KeyboardEvent`s with `bubbles: true`; exactly one `tabindex="0"` after **every** operation; `focusin` from a click syncs the tab stop; off-axis keys are not `preventDefault`ed; Tab leaves the group.

## Task 4 — selection

Click delegation, exclusivity, deselect, `setActive`, the `active` getter, the change event.

**Tests:** clicking an inactive button activates it and deactivates the previous; clicking the active one deactivates it and emits `{ button: null }`; the event fires once per gesture with the right element; `setActive` reflects and does **not** emit; the native `click` still reaches a listener on the group's parent; `active` returns `null` before any selection; a disabled button cannot be activated.

## Task 5 — CSS

Per §10, including the four orientations and the corner/border logic for reversed layouts.

## Task 6 — sandbox demo

`src/apps/sandbox/button-group.html`: all four orientations, icon-only buttons with `aria-label`, one disabled button in the middle, a group with none selected initially, and a listener logging both the group event and the native click.

This is where the API gets judged. If something feels awkward here, fix the design, not the demo.

## 11. Feedback

Likely candidates to send back into the docs: whether the two-events-per-gesture rule needs a stronger statement in the skill; whether `MutationObserver` for children is needed in practice or reading per operation suffices; and whether "movement is visual" survives contact with a real screen reader in a reversed layout.

## 12. Done

Per task: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

Overall: `accessibility.md` §10 checklist walked, plus a manual pass — Tab enters once and leaves once, arrows move in the direction the key points in all four orientations, disabled is skipped, the active button is announced as pressed, and the toolbar announces its name.
