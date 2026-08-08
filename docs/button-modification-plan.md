# ui-button — modification plan: toggle state

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.**

`ui-button` is built and its tests pass. This is a change to existing code, not a new component — `button-component.md` stays as the description of what the component *is*, and gets amended in §3, §4, §6 and §7 once this lands.

Read `accessibility.md` §0, §4 and §6 before starting.

---

## 1. Why

`widget-button-group` needs its buttons to carry pressed state so it can implement exclusive selection. The alternatives were a `ui-toggle-button` subclass (rejected — see `rationale.md`) and letting the group write `aria-pressed` onto its children directly (rejected — `accessibility.md` §5: a component does not write ARIA onto nodes it does not own).

## 2. What changes

Two things, both small, and the second is a refactor of what is already there.

**A `pressed` property**, reflecting a presence attribute, writing `aria-pressed` on the inner control.

**ARIA forwarding becomes a declared list** instead of two hardcoded branches, so adding the next forwarded attribute costs one array entry.

Nothing else moves. Skeleton, regions (none), events, focus delegation, the icon-only check, and the CSS are untouched apart from one new state rule.

## 3. `pressed`

```ts
pressed: boolean;   // ↔ 'pressed'  presence
```

- **Presence attribute**, like `disabled`. `hasAttribute` in the getter, `toggleAttribute` in the setter.
- **`aria-pressed` is written only when the attribute is present.** Absent → the inner control has no `aria-pressed` at all. A plain button carrying `aria-pressed="false"` announces as a toggle, which is worse than saying nothing (`accessibility.md` §4).
- Added to `observedAttributes`; `attributeChangedCallback` sets or removes `aria-pressed` on the control.
- Applied at first render too, alongside `type` and `disabled`.
- **The button never toggles itself.** It reflects what it is told. Activation emits the native `click`, which bubbles; whoever owns the state decides what to do. This is what keeps it a UI element (`plan.md` §1) and what keeps it loop-safe (`rationale.md`, reflect never emits).

`pressed` comes out of the "Out" list in `button-component.md` §3.

## 4. ARIA forwarding list

Replaces `#applyAccessibleName`.

```ts
// ui-button-dom.ts
const forwardedAria = [
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-expanded',
] as const;
```

- Copied to the control in a loop at first render, and each name is in `observedAttributes` so a later `setAttribute` on the host still lands. Removing the attribute on the host removes it from the control.
- **The attribute stays on the host as well.** The host has no role and is not focusable, so a duplicate there announces nothing, and removing consumer markup is not the component's business.
- `aria-pressed` is deliberately **not** in the list. It is state the component owns through the `pressed` property; accepting it from the host as well would give the same state two sources.

Note the list is a superset of what `ui-button` needs today — `aria-controls` and `aria-expanded` are there because a button that opens a menu or a disclosure is the obvious next consumer and they cost one line each. If that reads as speculative, cut them; the mechanism is the point, not the entries.

## 5. CSS

One rule, in `ui-button.css`, nested under the host class:

```css
.ui-button__control[aria-pressed='true'] { /* pressed appearance */ }
```

State comes from the ARIA attribute, never from a JS-toggled class (`accessibility.md` §7). Use per-component custom properties with fallbacks, as elsewhere in the file.

## 6. Interaction with existing behaviour

- **`disabled` + `pressed` together are valid** — a disabled toggle can be on. Nothing to do; both write independently.
- **The icon-only accessible-name check is unchanged**, but expect it to fire more often: icon-only toggles are more common than icon-only buttons. That is the check working, not a regression.
- **No new events.** The native `click` already bubbles out of the host and nothing re-dispatches it (skill §8).

## 7. Tests to add

In the existing `ui-button.test.ts`:

- `pressed` property reflects to the attribute and back.
- `pressed` present → control has `aria-pressed="true"`; absent → control has **no** `aria-pressed` attribute at all.
- Setting `pressed` after render updates the control.
- Setting `pressed` does **not** emit anything.
- Activating the button does **not** change `pressed` — it only fires `click`.
- Each forwarded ARIA attribute reaches the control at render.
- A forwarded ARIA attribute set **after** render reaches the control (this is the bug the list fixes).
- Removing a forwarded ARIA attribute from the host removes it from the control.
- `aria-pressed` written directly on the host is ignored — `pressed` is the channel.
- `disabled` and `pressed` together: control is disabled and `aria-pressed="true"`.

## 8. Docs to amend once this lands

- `button-component.md` §3 (`pressed` out of "Out"), §4 (public interface), §6 (`observedAttributes`, the ARIA list), §7 (state and forwarding).
- `rationale.md` already carries the reasoning for both decisions.

## 9. Done

`pnpm test` (the button suite), `pnpm typecheck`, `pnpm lint`. Plus a manual pass: a screen reader announces the pressed state changing, and a plain button is not announced as a toggle.
