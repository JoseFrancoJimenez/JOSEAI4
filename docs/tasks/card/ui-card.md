# ui-card — plan and tasks

Read the `web-components` skill before starting, and `docs/regions.md` before Task 2. This file specifies only what is specific to `ui-card`; everything else is in the skill.

> **First consumer of the region helper.** `src/lib/core/regions.ts` has been built and pinned with no consumer since `ui-button` dropped regions (`docs/regions.md`, status note). This is it. Where the helper or the authoring rules prove awkward, feed it back (§9) rather than working around it.

---

## 1. Goal

A UI element `<ui-card>`: a bordered container with three stacked sections — **header**, **body**, **footer** — each filled by the consumer, from markup or from code. An empty section takes no space and draws no separator.

It exists to be composed. Two consumers are foreseen: a positioned, non-modal **popup** with a `toggle()` and a close button, and an **overlay**. Neither puts a single requirement of state inside the card. Position, visibility, `toggle()`, `z-index`, and `role="dialog"` belong to the widget that composes the card — never to the card.

## 2. Classification

**UI element.** Strip external input and nothing remains to remember or decide: it holds no state, derives nothing, decides nothing. Therefore: `src/lib/elements/ui-card/`, `ui-` prefix, **no `setup()`**, renders immediately on connect (skill §5).

`setContent` does not change that. It is **input provisioning, not a command** (skill §7): exempt from `#assertReady`, and it never throws.

## 3. Scope

**In:** three content regions (`header`, `default`, `footer`); `setContent`; empty outlets hidden by CSS; separators between adjacent non-empty sections; per-component CSS knobs; the pre-upgrade visibility rule.

**Out — do not build, do not leave hooks for:** a `media` region; `header-actions` / `footer-actions` regions; appearance variants (accent/filled/outlined/plain); sizes; `orientation="horizontal"`; the `with-header` / `with-footer` / `with-media` attributes; any role or landmark semantics; a close button; custom events; an `open` property; positioning; `toggle()`; a `body` alias for `default`; `--ui-card-body-max-height`; **any attribute at all**.

Three of those deserve their reason recorded:

- **The `with-*` booleans** in the reference implementation (Web Awesome) exist only for SSR and for the absence of a `:has-slotted` pseudo-class. We do no SSR, and `:empty` on an outlet covers the same need at zero cost. Copying them would be the one place where following the reference is a direct mistake.
- **`--ui-card-body-max-height`** is the expected *first* addition: a popup showing a long feature record needs a scrollable body, and a consumer may not style `.ui-card__body` (`docs/plan.md` §4). It is out because that popup does not exist yet. One knob with a fallback, non-breaking to add.
- **`data-region="body"`** as an alias for `default` was considered and rejected: two names for one outlet, and `default` is already what the helper produces for unmarked children.

**The consequence to own.** `ui-card` accepts children, so its silent-loss case is not `ui-button`'s. It is the typo:

```html
<ui-card><span data-region="lable">Title</span></ui-card>
```

Harvested, claimed by no outlet, destroyed, and the skeleton write covers the tracks. **The card writes no warning of its own for this.** It passes `regionNames` to `harvestRegions` and the helper's unclaimed-region error covers it (`docs/regions.md` §5). A second check here would be exactly the per-component duplication that warning exists to replace.

The other fate — children appended **after** first connect are never harvested and render as unmanaged siblings of the skeleton (skill §7.1) — is documented, not guarded. No `MutationObserver` (skill §12).

## 4. Public interface

```ts
export type UiCardRegion = 'header' | 'default' | 'footer';

export class UiCardElement extends HTMLElement {
  setContent(region: UiCardRegion, content: RegionContent): void;
}
```

**Zero attributes, zero properties, one method.** No `setup()`, no commands, no custom events, no `focus()` override.

- **No `observedAttributes`, no `attributeChangedCallback`, no `#upgradeProperties`.** There is nothing to observe, and no public property with a setter that does work. Say so in a comment (skill §6), or a total omission reads as an oversight rather than a decision.
- **`setContent` never throws.** An unknown region name is ignored. Before render it stashes; at fill time the stash applies; after render it applies immediately.
- **`RegionContent` is the helper's type** (`string | Node | DocumentFragment`), imported from `src/lib/core/`, never redeclared.

From markup:

```html
<ui-card>
  <h3 data-region="header">Parcel 12-B</h3>
  Area: 1,240 m²
  <ui-button data-region="footer" label="Open record"></ui-button>
</ui-card>
```

From code — the path a popup will use:

```ts
const header = new DocumentFragment();
header.append(titleNode, closeButton);   // closeButton is a <ui-button> (skill §11)
card.setContent('header', header);
card.setContent('default', infoNode);    // replaced on every selection
```

This is the whole reason `setContent` is the card's primary API rather than an accessory: a popup's body changes on every interaction, and a consumer may not reach into the card's DOM (`docs/plan.md` §4).

## 5. Skeleton

```ts
html(): string {
  return `<div class="${cls.header}" data-outlet="header"></div><div class="${cls.body}" data-outlet="default"></div><div class="${cls.footer}" data-outlet="footer"></div>`;
}
```

- **Rendered directly into the host's light DOM** — no inner wrapper. The host is the flex column.
- **All three outlets are neutral `<div>`s.** The header outlet is deliberately **not** an `<h2>`: the skill §7 example uses one, but here the consumer supplies the heading, and a `<ui-button>` close control landing inside a heading element would be wrong. The outlet carries layout; it carries semantics only where the component genuinely owns them.
- **Zero inner whitespace**, or the `:empty` rules that hide outlets and suppress separators will not match (skill §7, §10).
- **No defaults written inside any outlet.** A card with no header has no header; there is nothing sensible to fall back to. Outlets stay in the DOM, empty and hidden, so a later `setContent` still has a target.
- **DOM order is always header, body, footer.** Nothing reorders.

## 6. Content regions

Declared in `ui-card-dom.ts` alongside `cls`, type exported from `index.ts`:

```ts
export const regionNames = ['header', 'default', 'footer'] as const;
```

- **`default` must be in the list.** Unmarked children and bare text land in `default` (`docs/regions.md` §3); omitting it would make the unclaimed-region check fire on the most ordinary markup there is.
- **Precedence** (skill §7): harvest always counts as the **first** write, whenever it physically runs. So `setContent` called before the host is attached beats the harvest that follows it. The convenience-attribute half of that rule does not apply — there is no attribute competing for an outlet. After first render, latest write wins.
- **Repeated names merge** in document order (`docs/regions.md` §3): two children with `data-region="footer"` both land.
- **Strings enter as text**, never parsed as HTML. Nodes and fragments are **moved**, never serialized.
- **Clearing a region is `setContent(name, '')`.** There is no `unfill`.
- **A custom element supplied in a region must survive a full teardown** (skill §7): harvest detaches it, its disconnect microtask may fire and legitimately tear it down, and the fill step reattaches it so connect runs again. The foreseen close button is a `<ui-button>` arriving exactly this way, so this gets its own test rather than being assumed.

## 7. Accessibility

**No APG pattern**, and that is the finding, not a gap. `docs/accessibility.md` §1: static or form-like content is plain semantic HTML in natural tab order, and no ARIA is better than wrong ARIA. Name it in the comment at the top of the component — *no APG pattern: static container* — so the absence reads as a decision.

- **No `role`.** `role="region"` and `role="group"` were both considered and rejected: each names a grouping, so §4 would then require an accessible name plus a dev warning when it is missing. That is ceremony for a bordered container with no interaction. A widget that needs `role="dialog"` puts it on **its own** host.
- **No `tabindex`, no keyboard model, no focus management.** Tab order runs through the consumer's content in DOM order, which is also the visual order — the card never reorders sections, so §2's visual-vs-DOM-order rule cannot be violated here.
- **The card owns structure; the consumer owns meaning inside a region** (§5). The card writes **no ARIA at all** — not on itself, not on supplied nodes.
- **No outlet is decorative**, so none is `aria-hidden`. An empty, unlabelled outlet surfaces nowhere in the accessibility tree by itself, and `display: none` removes it regardless.
- The §10 checklist applies and is mostly N/A. Walk it and record the N/As; do not skip it.

## 8. Files

```
src/lib/elements/ui-card/
  ui-card.ts
  ui-card.css
  ui-card-dom.ts      # cls map + regionNames
  ui-card.test.ts
  index.ts            # UiCardElement + UiCardRegion
src/apps/sandbox/
  ui-card.html        # demo page (Task 4)
```

Every file starts with `// AWESOME AI` (skill §14).

---

## Task 1 — element skeleton and rendering

Class, guarded registration, `HTMLElementTagNameMap`, `cls` map in `ui-card-dom.ts`, `html()` per §5, `connectedCallback` per skill §4 — `classList.add(cls.host)`, then render — and a `#rendered` flag. No property upgrade (there are no properties). No harvest yet.

**Tests:** mounts and renders once; a move (remove, re-append, flush a microtask) does not re-render; the three outlets exist, are empty, and are in header–body–footer order; instantiating from HTML and programmatically both work.

## Task 2 — regions and `setContent`

**Read `docs/regions.md` before starting this task.**

Add `regionNames`; harvest in `connectedCallback` **before anything writes to the host** (skill §4: upgrade → harvest → render); a `#harvested` flag **separate** from `#rendered`; a stash for `setContent` calls that arrive before render; fill at render and immediately thereafter.

**Tests** (from `docs/testing.md` §7, all of which apply):

- `data-region` content lands in the matching outlet.
- A bare text child lands in the `default` outlet.
- Whitespace-only text nodes are ignored — pretty-printed markup does not fill `default`.
- Two children with the same `data-region` both land, in document order.
- A `data-region` name the card does not declare produces a dev error; the content is destroyed, so the error is the only evidence.
- `setContent` works before render (stashed) and after render (immediate), never throws, and overrides harvested content.
- `setContent` before the host is attached beats the later harvest (§6 precedence).
- `setContent(name, '')` clears a filled outlet.
- An unknown name passed to `setContent` is ignored without throwing.
- A string is inserted as text — `setContent('header', '<b>x</b>')` yields no `<b>`.
- A fragment's children all move.
- A region nobody supplied leaves its outlet empty (this component writes no defaults).
- A move (remove, re-append, flush a microtask) does not re-harvest: the rendered skeleton is intact.
- A `<ui-button>` supplied in a region is connected and functional after render (harvest → teardown microtask → fill → reconnect).

## Task 3 — CSS

`ui-card.css`, imported by `ui-card.ts`. Block is the full tag name.

- `display: flex; flex-direction: column` on `.ui-card`.
- `ui-card:not(:defined) { visibility: hidden; }` — tag-based, the one exception to selecting by the host class (skill §10).
- `.ui-card [data-outlet]:empty { display: none; }`.
- **Separators.** One rule, not three:

  ```css
  .ui-card [data-outlet]:not(:empty) ~ [data-outlet]:not(:empty) {
    border-block-start: var(--ui-card-border-width, 1px) solid var(--ui-card-border-color, …);
  }
  ```

  A non-empty section preceded by another non-empty section draws its own top edge. This is correct in every combination without a single special case — including **header + footer with no body**, where a naive "border below the header, border above the footer" pair would draw a double line. Verify that case in the sandbox; it is the one the CSS-only approach could surprise on.
- Padding on each **section**, not on the host, so a separator spans the full width.
- `overflow: hidden` on the host so the radius clips oversized content (an image dropped into the body). Reversible if it ever fights a consumer.
- Knobs, each with a fallback, named after the tag: `--ui-card-padding`, `--ui-card-radius`, `--ui-card-border-width`, `--ui-card-border-color`, `--ui-card-background`. The separator reuses the border colour deliberately — one colour, coherent result.
- Layout and border only. No typography, no colour beyond `inherit` and the knobs above. The border colour fallback should derive from the inherited colour rather than name one (see §10, open question).
- Low specificity (`:where()` where useful), no `!important`.

## Task 4 — sandbox demo

`src/apps/sandbox/ui-card.html`, exercising every path: all three sections; body only; header + body; body + footer; **header + footer with no body**; bare text as the body; a `<ui-button data-region="footer">`; a programmatic `setContent` on a timer; a card built entirely in code whose header is a fragment of title + close `<ui-button>` — the popup's composition path rehearsed without the popup; and one card with a deliberate `data-region` typo, to see the helper's error in a real console.

This is where the API gets judged. If something feels awkward here, fix the design, not the demo.

## 9. Feedback to the skill

`ui-card` is the first component to exercise regions end to end. Where a rule proves wrong, incomplete, or awkward, note it and raise it — do not work around it silently.

Expected candidates:

- Skill §7's outlet example uses `<h2 data-outlet="header">`. For a card the outlet must be neutral. Worth one sentence in the skill: the outlet element carries layout, and semantics only where the component genuinely owns them.
- First component with **no** attributes and **no** properties. Confirm the "note the omission in a comment" rule (§6) still reads sensibly when the omission is total.
- Whether `docs/regions.md`'s "revisit if still unused when the third component ships" note can now be struck.

## 10. Open questions

Raise rather than work around.

- **Shared token tier.** Skill §10 names only `--ui-focus-ring`. If a shared surface/radius/border token exists or is planned, `--ui-card-radius` and `--ui-card-border-color` must defer to it instead of carrying literal fallbacks. Settle before Task 3 — and do not create a token file for one component, which is the call `ui-button` already made.
- **`--ui-card-body-max-height`** — decide when `widget-popup` is planned, not before.
- Whether the separator rule's `:empty` dependence needs to be called out anywhere beyond §5's zero-whitespace note. It is the second thing that breaks silently if an outlet is authored with a newline inside it.

## 11. Done

Per task: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

For the component overall: the checklist in `docs/accessibility.md` §10 walked with its N/As recorded, plus a manual pass — Tab runs through the consumer's content in visual order, an empty section takes no space and draws no separator, and a screen reader announces the supplied heading and nothing the card invented.