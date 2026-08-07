# ui-button — plan and tasks

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.**

Read `.claude/skills/web-components/SKILL.md` before starting, and `accessibility.md` before Task 2. This file specifies only what is specific to `ui-button`; everything else is in the skill.

---

## 1. Goal

A UI element `<ui-button>` rendering a real `<button>` in light DOM, with two content regions — an icon and a label — fillable from HTML attributes, from JS properties, or by supplying content directly. Icon sits before or after the label. Icon-only buttons are supported and must carry an accessible name.

It is the library's first component, so it also builds the shared region helper (Task 0) and is the first practical test of the authoring rules. Expect it to send one or two corrections back into the skill; record them (§9) rather than working around them.

## 2. Classification

**UI element.** Strip external input and nothing remains to remember or decide — it holds no state and derives nothing. Therefore: `src/lib/elements/ui-button/`, `ui-` prefix, no `setup()`, renders immediately on connect.

## 3. Scope

**In:** label and icon regions; `label`, `icon`, `icon-position`, `type`, `disabled` attributes with reflecting properties; `setContent`; focus delegation; icon-only support with a dev-time accessible-name check.

**Out — do not build, do not leave hooks for:** variants (primary/secondary/danger), sizes, loading state, toggle/`aria-pressed`, `href`/anchor rendering, `name`/`value` form participation, a `control` getter exposing the inner button, soft-disabled (`aria-disabled`) mode, custom events, RTL handling, a shared design-token file.

`name`/`value` and soft-disabled are both non-breaking to add later. They are out because there is no present need.

## 4. Public interface

```ts
export type UiButtonRegion = 'default' | 'icon';
export type UiButtonType = 'button' | 'submit' | 'reset';
export type UiButtonIconPosition = 'start' | 'end';

export class UiButtonElement extends HTMLElement {
  label: string;                        // ↔ 'label'
  icon: string;                         // ↔ 'icon'           e.g. 'fa-solid fa-star'
  iconPosition: UiButtonIconPosition;   // ↔ 'icon-position'  default 'start'
  type: UiButtonType;                   // ↔ 'type'           default 'button'
  disabled: boolean;                    // ↔ 'disabled'       presence

  setContent(region: UiButtonRegion, content: string | Node | DocumentFragment): void;

  focus(options?: FocusOptions): void;
  blur(): void;
}
```

No `setup()`. No commands. No custom events.

**`focus()` and `blur()` are overridden** to delegate to the inner control — the host is not focusable, so `HTMLElement`'s inherited versions would silently do nothing useful. This is the only inherited behaviour the component overrides.

## 5. Skeleton and regions

```html
<button type="button" class="ui-button__control">
  <span class="ui-button__icon" data-outlet="icon" aria-hidden="true"></span>
  <span class="ui-button__label" data-outlet="default"></span>
</button>
```

- **DOM order is always icon-then-label.** `icon-position="end"` is CSS `order` on the icon outlet; the DOM never reorders.
- **Both outlets are written with zero inner whitespace**, or the `:empty` rule that hides them will not match.
- **The icon class goes on a child inside the outlet, never on the outlet itself** — `<i class="fa-solid fa-star">` — so setting `icon` twice cannot leave stale classes behind.
- `type="button"` is hardcoded in the skeleton; the `type` attribute overrides it.

## 6. Authoring paths and precedence

Three ways to fill a region, all equivalent in effect:

```html
<ui-button label="Save" icon="fa-solid fa-floppy-disk"></ui-button>

<ui-button icon="fa-solid fa-star" aria-label="Favourite"></ui-button>

<ui-button label="Save" icon-position="end">
  <special-icon data-region="icon"></special-icon>
</ui-button>
```

```ts
button.label = 'Save';
button.setContent('icon', svgNode);
```

Rules:

- **Harvest is the first write** (skill §7). At first render, a harvested `data-region` beats the convenience attribute for the same outlet — it is the more specific of the two writes available at that moment.
- **After first render, the latest write wins**, whatever channel: `button.icon = 'fa-solid fa-star'` replaces a previously supplied node, because the consumer asked for it explicitly.
- **`label` and `icon` are convenience writers into regions**, not separate state. `icon="x y"` builds `<i class="x y">` into the icon outlet; `label="Save"` sets `textContent` on the default outlet.
- **`label=""` is unset, not empty** — `<ui-button label="" icon="…">` is an icon-only button, since an empty string falls naturally out of templating.
- A region nobody fills keeps the skeleton default (here: nothing), stays empty, and is hidden by CSS.

`observedAttributes`: `label`, `icon`, `icon-position`, `type`, `disabled` — so a `setAttribute` after render takes effect and the HTML and JS paths stay symmetric.

## 7. Accessibility

APG pattern: **Button**. Most of it is native and must stay that way.

- **One button, not two.** The host gets no `tabindex`, no `role`, and is never a focus target. The inner `<button>` is the only accessible control.
- **Native `disabled`** on the inner control. It removes the control from the tab order, blocks activation, and announces correctly — no ARIA, no swallowed events, no code.
- **The icon outlet is `aria-hidden="true"`** in the skeleton, so whatever lands there is excluded from the accessibility tree — including a consumer-supplied `<special-icon>`.
- **Accessible name:** the label region normally provides it. `aria-label` / `aria-labelledby` on the host must be forwarded to the inner control, since a name on a non-focusable wrapper is not announced.
- **Icon-only check (dev only):** one microtask after first render, if the default outlet is empty and the control has no accessible name, `console.error` naming the element. Deferred by a microtask so a consumer calling `setContent('default', …)` right after connect does not trigger a false alarm. Wrapped in `import.meta.env.DEV`; never ships.
- **No custom events** — the inner button's `click` bubbles out of the host. Nothing is re-dispatched (skill §8).
- **`:focus-visible`** styled on the inner control. Hardcode the ring in `ui-button.css`; do not create a token file for one component.

## 8. Files

```
src/lib/core/
  regions.ts            # Task 0 — shared, used by every component
  regions.test.ts
src/lib/elements/ui-button/
  ui-button.ts
  ui-button.css
  ui-button-dom.ts      # cls map, region names
  ui-button.test.ts
  index.ts              # UiButtonElement + public types
src/apps/sandbox/
  ui-button.html        # demo page (Task 5)
```

---

## Task 0 — `src/lib/core/regions.ts`

The shared harvest/fill helper. Build it first; `ui-button` is its first consumer.

**Surface:**

```ts
export type RegionContent = string | Node | DocumentFragment;
export type HarvestedRegions = Map<string, DocumentFragment>;

export function harvestRegions(host: HTMLElement): HarvestedRegions;
export function fillRegion(outlet: Element, content: RegionContent): void;
```

`Map` rather than a record: this is a private field, never state, and a `Map` reads better here. The store's record preference does not apply.

**`harvestRegions`:**

- Iterates `host.childNodes`, not `children` — bare text (`Save`) must survive.
- Skips whitespace-only text nodes, so pretty-printed HTML does not fill the `default` region and suppress a component's default.
- An element with `data-region="<name>"` goes to that region; everything else goes to `default`.
- Moves nodes into per-region `DocumentFragment`s, leaving the host empty.
- Dev-only: warns when `document.readyState === 'loading'`, meaning a classic blocking script registered the definition mid-parse and children may be incomplete. Message names the tag and says an inline script during initial parse is a possible false positive.

**`fillRegion`:** replaces the outlet's children. A string enters via `textContent`, never parsed as HTML. A node or fragment is moved as-is.

**Tests:** named regions land correctly; unnamed children and bare text land in `default`; whitespace-only nodes ignored; host is empty afterwards; strings insert as text (`fillRegion(o, '<b>x</b>')` yields no `<b>`); a fragment's children all move; the readyState warning fires only in the loading state.

**Done:** tests, typecheck, lint green.

## Task 1 — element skeleton and rendering

Class, registration, `HTMLElementTagNameMap`, `cls` map and region names in `ui-button-dom.ts`, `html()` per §5, `connectedCallback` per skill §4 (upgrade properties → harvest once → render), `#rendered`/`#harvested` flags.

No attributes wired yet — render the skeleton with empty outlets and stop.

**Tests:** mounts and renders once; a move (remove, re-append, flush a microtask) does not re-render or re-harvest; outlets exist and are empty.

## Task 2 — attributes, properties, and fill

Wire `label`, `icon`, `icon-position`, `type`, `disabled`: reflecting properties, `observedAttributes`, `attributeChangedCallback`, and the fill step applying harvested regions and attribute-derived content per §6. `setContent`. Focus delegation. `aria-label`/`aria-labelledby` forwarding.

`setContent` is input provisioning, not a command: it never throws, stashes before render, applies immediately after.

**Read `accessibility.md` before starting this task.**

**Tests:** each attribute renders; each property reflects to its attribute and back; harvested region beats attribute at first render; a later property or attribute write replaces harvested content; `setContent` before and after render; `label=""` is treated as unset; unknown region name ignored without throwing; `disabled` blocks activation and removes the control from the tab order; `focus()` lands on the inner control; a `click` handler on the host fires exactly once; `type="submit"` inside a `<form>` fires the form's `submit` event (assert the event — jsdom does not navigate).

## Task 3 — CSS

`ui-button.css`, imported by `ui-button.ts`. Block is the full tag name: `.ui-button__control`, `.ui-button__icon`, `.ui-button__label`.

- Explicit `display` on the host.
- `ui-button:not(:defined) { visibility: hidden; }`.
- `ui-button [data-outlet]:empty { display: none; }`.
- `icon-position="end"` → `order` on the icon outlet.
- `:focus-visible` ring on the control, hardcoded.
- Layout only on the outlets — no typography or colour on consumer-supplied content.
- Per-component knobs named after the tag (e.g. `--ui-button-gap`), each with a fallback.

## Task 4 — icon-only accessible-name check

Dev-only, one microtask after first render, per §7.

**Tests:** icon-only without a name errors; icon-only with `aria-label` does not; a label present does not; `setContent('default', …)` immediately after connect does not (this is what the microtask buys).

## Task 5 — sandbox demo

`src/apps/sandbox/ui-button.html`, exercising every authoring path: attribute-only, region-only, both together, icon-only with `aria-label`, disabled, both icon positions, a programmatic `setContent` on a timer, and a `<ui-button type="submit">` in a form.

This is where the API gets judged. If something feels awkward here, fix the design, not the demo.

## 9. Feedback to the skill

`ui-button` is the first real use of the authoring rules. Where a rule proves wrong, incomplete, or awkward in practice, note it and raise it — do not work around it silently. Likely candidates: the `:empty`-hiding convention, the harvest-first precedence rule, and whether `fillRegion` needs an "unfill" for a region cleared after render.

## 10. Done

Per task: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

For the component overall: the checklist in `accessibility.md` §9 walked, and a manual keyboard pass — Tab reaches the button, Enter and Space activate it, focus is visible, disabled is skipped.