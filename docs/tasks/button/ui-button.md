# ui-button — plan and tasks

Read the `web-components` skill before starting, and `docs/accessibility.md` before Task 2. This file specifies only what is specific to `ui-button`; everything else is in the skill.

> **No content regions.** `ui-button` is configured entirely by attributes and properties. The shared region helper is unaffected and lives in `docs/regions.md`; the reasoning for the split is in `docs/rationale.md`.

---

## 1. Goal

A UI element `<ui-button>` rendering a real `<button>` in light DOM, with an icon and a label supplied by attributes or properties. Icon sits before or after the label. Icon-only buttons are supported and must carry an accessible name.

It is the library's first component and the first practical test of the authoring rules. Expect it to send one or two corrections back into the skill; record them (§9) rather than working around them.

## 2. Classification

**UI element.** Strip external input and nothing remains to remember or decide — `pressed` is told to it, never toggled by it. Therefore: `src/lib/elements/ui-button/`, `ui-` prefix, no `setup()`, renders immediately on connect.

## 3. Scope

**In:** `label`, `icon`, `icon-position`, `type`, `disabled`, `pressed`, `value` attributes with reflecting properties; a declared list of forwarded ARIA attributes; focus delegation; icon-only support with a dev-time accessible-name check.

**Out — do not build, do not leave hooks for:** content regions, `setContent`, harvesting; variants (primary/secondary/danger); sizes; loading state; `href`/anchor rendering; `name` and form participation; a `control` getter exposing the inner button; soft-disabled (`aria-disabled`) mode; custom events; a tab-stop property; RTL handling.

`name`/form participation, soft-disabled, regions, and a `tabStop` property are all non-breaking to add later. They are out because there is no present need. (`tabStop` would only be needed if a consumer ever adopts a roving-tabindex model — see `widget-button-group-plan.md` §11.)

**The consequence to own:** with no regions, `<ui-button>Save</ui-button>` is not supported. Children are wiped at render (`this.innerHTML = html()`), silently. That is the most natural way to write a button in HTML, so it gets a dev warning — Task 4.

## 4. Public interface

```ts
export type UiButtonType = 'button' | 'submit' | 'reset';
export type UiButtonIconPosition = 'start' | 'end';

export class UiButtonElement extends HTMLElement {
  label: string;                        // ↔ 'label'
  icon: string;                         // ↔ 'icon'           e.g. 'fa-solid fa-star'
  iconPosition: UiButtonIconPosition;   // ↔ 'icon-position'  default 'start'
  type: UiButtonType;                   // ↔ 'type'           default 'button'
  disabled: boolean;                    // ↔ 'disabled'       presence
  pressed: boolean;                     // ↔ 'pressed'        presence
  value: string;                        // ↔ 'value'          default ''

  focus(options?: FocusOptions): void;
  blur(): void;
}
```

No `setup()`. No commands. No custom events. No `setContent`.

**`focus()` and `blur()` are overridden** to delegate to the inner control — the host is not focusable, so `HTMLElement`'s inherited versions would silently do nothing useful. This is the only inherited behaviour the component overrides.

**`value` is identity, not form participation.** It exists so an owning widget can name a button in a serializable event payload (skill §8 forbids DOM nodes in `detail`). It is inert here: nothing renders it, nothing reacts to it, and it does not make the button a form control.

**`pressed` is told, never taken.** The button never toggles itself: activation fires the native `click`, and whoever owns the state decides what to do. That is what keeps it a UI element (`docs/plan.md` §1) and what keeps it loop-safe (`docs/rationale.md`, reflect never emits).

## 5. Skeleton

```html
<button type="button" class="ui-button__control">
  <span class="ui-button__icon" aria-hidden="true"></span>
  <span class="ui-button__label"></span>
</button>
```

- **DOM order is always icon-then-label.** `icon-position="end"` is CSS `order` on the icon span; the DOM never reorders.
- **Both spans are written with zero inner whitespace**, or the `:empty` rule that hides them will not match.
- **The icon class goes on a child inside the span, never on the span itself** — `<i class="fa-solid fa-star">` — so setting `icon` twice cannot leave stale classes behind.
- `type="button"` is hardcoded in the skeleton; the `type` attribute overrides it.

## 6. Attributes and properties

```html
<ui-button label="Save" icon="fa-solid fa-floppy-disk"></ui-button>
<ui-button icon="fa-solid fa-star" aria-label="Favourite"></ui-button>
<ui-button label="Save" icon-position="end"></ui-button>
```

```ts
button.label = 'Save';
button.pressed = true;
```

Rules:

- **Latest write wins**, whatever the channel — property or attribute. There is no harvest and therefore no precedence question.
- **`label` and `icon` write into their spans**, they are not separate state: `icon="x y"` builds `<i class="x y">`; `label="Save"` sets `textContent`.
- **`label=""` is unset, not empty** — `<ui-button label="" icon="…">` is an icon-only button, since an empty string falls naturally out of templating. Same for `icon=""`.
- **Clearing works.** Removing the attribute or setting the property to `''` empties the corresponding span, which the `:empty` CSS then hides. The getter and the DOM never disagree.
- **`disabled` and `pressed` are presence attributes** — `hasAttribute` in the getter, `toggleAttribute` in the setter. Both are valid together: a disabled toggle can be on.

`observedAttributes`: `label`, `icon`, `type`, `disabled`, `pressed`, plus the forwarded ARIA list.

- **`icon-position` is not observed** — it is styled entirely by a CSS attribute selector, so there is nothing to react to (skill §6). Say so in a comment, or the omission reads as an oversight.
- **`value` is not observed** for the same reason: nothing in the component reacts to it. The getter reads the attribute live.
- **The forwarded ARIA attributes are observed**, so a name set after connect still reaches the control. Forwarding once at render would make the dev warning in Task 4 tell consumers to do something that does not work.

### Forwarded ARIA

```ts
// ui-button-dom.ts
export const forwardedAria = [
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-expanded',
] as const;
```

- Copied to the control in a loop at first render, and each name is in `observedAttributes`, so a later `setAttribute` on the host lands and a removal removes it from the control. Adding the next forwarded attribute costs one array entry, not a new branch.
- **The attribute stays on the host as well.** The host has no role and is not focusable, so a duplicate announces nothing, and removing consumer markup is not the component's business.
- **`aria-pressed` is deliberately not in the list.** It is state the component owns through `pressed`; accepting it from the host too would give one state two sources. `aria-pressed` written directly on the host is ignored.
- The list is a superset of what the button needs today — `aria-controls` and `aria-expanded` are there because a button opening a menu or a disclosure is the obvious next consumer, at one line each. If that reads as speculative, cut them; the mechanism is the point, not the entries.

## 7. Accessibility

APG pattern: **Button**. Most of it is native and must stay that way.

- **One button, not two.** The host gets no `tabindex`, no `role`, and is never a focus target. The inner `<button>` is the only accessible control. (Why the host cannot simply take the role: `docs/rationale.md`.)
- **Native `disabled`** on the inner control. It removes the control from the tab order, blocks activation, and announces correctly — no ARIA, no swallowed events, no code.
- **The icon span is `aria-hidden="true"`**, so a decorative glyph never reaches the accessibility tree.
- **Accessible name:** the label normally provides it; `aria-label` / `aria-labelledby` on the host are forwarded to the control, since a name on a non-focusable wrapper is not announced (§6).
- **Pressed state:** `pressed` writes `aria-pressed="true"` on the control when present, and **removes the attribute entirely** when absent — never `"false"`, which would announce a plain button as a toggle (`docs/accessibility.md` §4).
- **No custom events** — the inner button's `click` bubbles out of the host and nothing re-dispatches it (skill §8).
- **`:focus-visible`** styled on the control using the shared `--ui-focus-ring` token with a fallback (skill §10). Do not hardcode a bare value; do not create a token file for one component.

## 8. Files

```
src/lib/elements/ui-button/
  ui-button.ts
  ui-button.css
  ui-button-dom.ts      # cls map + forwardedAria
  ui-button.test.ts
  index.ts              # UiButtonElement + public types
src/apps/sandbox/
  ui-button.html        # demo page (Task 5)
```

---

## Task 1 — element skeleton and rendering

Class, registration, `HTMLElementTagNameMap`, `cls` map in `ui-button-dom.ts`, `html()` per §5, `connectedCallback` per skill §4 (upgrade properties → render), `#rendered` flag. No `#harvested` flag — there is nothing to harvest.

No attributes wired yet — render the skeleton with empty spans and stop.

**Tests:** mounts and renders once; a move (remove, re-append, flush a microtask) does not re-render; both spans exist and are empty.

## Task 2 — attributes, properties, and ARIA forwarding

**Read `docs/accessibility.md` before starting this task.**

Wire `label`, `icon`, `icon-position`, `type`, `disabled`, `pressed`, `value`: reflecting properties, `observedAttributes`, `attributeChangedCallback`. Focus delegation. The forwarded ARIA loop at render and on change. Apply `type`, `disabled` and `pressed` at first render alongside the rest.

**Tests:** each attribute renders; each property reflects to its attribute and back; a later write replaces an earlier one; `label=""` and `icon=""` are treated as unset; removing `label` or `icon` after render empties the span; `disabled` blocks activation (a host `click` handler does not fire) and removes the control from the tab order; `focus()` lands on the inner control; a `click` handler on the host fires exactly once; `type="submit"` inside a `<form>` fires the form's `submit` event (assert the event — jsdom does not navigate).

Pressed and value: `pressed` present → control has `aria-pressed="true"`; absent → the control has **no** `aria-pressed` attribute at all; setting `pressed` after render updates the control; setting `pressed` emits nothing; activating the button does **not** change `pressed`; `disabled` and `pressed` together both apply; `aria-pressed` on the host is ignored; `value` reflects both ways and renders nothing.

ARIA list: each forwarded attribute reaches the control at render; one set **after** render reaches the control; removing it from the host removes it from the control.

## Task 3 — CSS

`ui-button.css`, imported by `ui-button.ts`. Block is the full tag name.

- Explicit `display` on the host.
- `ui-button:not(:defined) { visibility: hidden; }` — tag-based, the one exception to selecting by the host class.
- `.ui-button__icon:empty, .ui-button__label:empty { display: none; }`.
- `icon-position="end"` → `order` on the icon span.
- `.ui-button__control[aria-pressed='true']` → pressed appearance. State comes from the ARIA attribute, never a JS-toggled class (`docs/accessibility.md` §7).
- `:focus-visible` ring on the control, from `--ui-focus-ring` with a fallback.
- Layout only — no typography or colour beyond `inherit`.
- Per-component knobs named after the tag (e.g. `--ui-button-gap`, `--ui-button-radius`), each with a fallback. `--ui-button-radius` is public surface with a consumer: `widget-button-group` shapes end corners through it instead of touching internals.

## Task 4 — dev-only checks

Both wrapped in `import.meta.env.DEV`.

**Accessible name.** One microtask after first render: if the label span is empty and the control has no accessible name, `console.error` naming the element. Deferred by a microtask so a consumer setting `label` right after connect does not trigger a false alarm. Expect it to fire often once toggles exist — icon-only toggles are common, and that is the check working.

**Children supplied.** At connect, *before* the skeleton is written: if the host has any non-whitespace child nodes, `console.error` naming the element and stating that `ui-button` takes no content — use `label` and `icon`. This catches silent deletion of `<ui-button>Save</ui-button>`.

**Tests:** icon-only without a name errors; icon-only with `aria-label` does not; a label present does not; setting `label` immediately after connect does not (this is what the microtask buys); a button with a text child errors; whitespace-only children do not error.

## Task 5 — sandbox demo

`src/apps/sandbox/ui-button.html`, exercising every path: label only, icon only with `aria-label`, both, disabled, both icon positions, a pressed toggle, a programmatic `label` change on a timer, and a `<ui-button type="submit">` in a form.

This is where the API gets judged. If something feels awkward here, fix the design, not the demo.

## 9. Feedback to the skill

`ui-button` is the first real use of the authoring rules. Where a rule proves wrong, incomplete, or awkward in practice, note it and raise it — do not work around it silently.

Already fed back and applied: the focus-ring token belongs to the skill's two-tier theming, not hardcoded per component; `observedAttributes` should carry only attributes the component reacts to; a component that accepts no children should say so in dev rather than deleting them silently.

## 10. Done

Per task: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

For the component overall: the checklist in `docs/accessibility.md` §10 walked, and a manual keyboard pass — Tab reaches the button, Enter and Space activate it, focus is visible, disabled is skipped, a pressed toggle announces its state, and a plain button is not announced as a toggle.