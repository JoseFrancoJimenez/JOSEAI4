# ui-card — plan update: section layout and constrained height

An amendment to `docs/ui-card-plan.md`. Apply it before Task 3. Nothing here changes the component's classification, public interface, or accessibility contract — it is all CSS.

Two things brought it about, and they are worth keeping separate because only one of them was foreseen:

- **An omission.** The plan declared three outlets and never said how each arranges *its own* children. That was a gap from the start, not a consequence of anything below.
- **A deferred question, now due.** `docs/ui-card-plan.md` §10 parked `--ui-card-body-max-height` with the words *"decide when `widget-popover` is planned, not before."* That widget is now planned.

---

## 1. The omission: the outlets had no layout of their own

`widget-popover` fills the header with `[title, close button]`. With no `display` on the header outlet those stack vertically. The same applies to a footer holding two action buttons.

This is squarely allowed: skill §10 says the outlet controls **placement, size, and spacing** of region content, and that only typography and colour belong to the consumer. Arranging two supplied nodes in a row is placement.

**Header and footer become flex rows. The body stays `display: block`,** which is its default and a deliberate choice rather than an oversight — say so in a comment. The body holds arbitrary content: paragraphs, lists, a whole widget. Making it a flex container turns every child into a flex item, stops margins from collapsing, and breaks ordinary prose in ways nobody debugging a card would think to look for. Header and footer are strips of components; the body is a document.

## 2. Two height controls, and both are wanted

The original plan assumed one mechanism and rejected it. There are two, they work from opposite directions, and they do not compete:

- **From outside.** A consumer caps its own host — `widget-popover` does this with `--widget-popover-max-height`. The card's body then takes whatever slack is left and scrolls inside it. This needs no API at all; it needs the card to behave correctly as a flex column.
- **From inside.** `--ui-card-body-max-height`, default `none`, caps the body directly. The card's total height is then header + body + footer, which is the predictable one: the consumer sets a number and gets it.

The effective height is whichever binds first, so both can be present without either being wrong. With the inside knob available, a consumer can cap a card that has no constrained ancestor at all — which the outside mechanism cannot do.

Three declarations carry the outside case:

```css
flex: none;        /* header and footer: never grow, never shrink */
flex: 1 1 auto;    /* body: takes the slack */
min-height: 0;     /* body: without it, refuses to shrink and overflows instead */
```

`min-height: 0` is the load-bearing one and the one that gets deleted by someone tidying up. Comment it.

## 3. The footer alignment knob

`--ui-card-footer-align`, default `flex-end`.

The reasoning is worth recording, because a knob usually needs more justification than this one does. `justify-content` lives on `.ui-card__footer` — an internal class the consumer may not touch (`docs/plan.md` §4). So either the card decides the alignment or **nobody can**. There is no "leave it to the consumer" option here.

Given that, the default should be the common case: trailing actions, the convention for a card or dialog footer. And given that a default which cannot be overridden is a trap, it becomes a custom property rather than a hardcoded value — which is exactly skill §10's two-tier theming, a per-component knob named after the tag, with a fallback.

The header needs no equivalent. Its only asymmetry is `widget-popover`'s close button, and the popover pushes **its own node** with `margin-inline-start: auto` from its own stylesheet. That is a component styling a node it owns, not a consumer reaching into the card.

## 4. The CSS — replaces the section rules in Task 3

```css
.ui-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ui-card__header,
.ui-card__footer {
  display: flex;                 /* arranges supplied content in a row */
  align-items: center;
  gap: var(--ui-card-gap, 0.5rem);
  flex: none;                    /* as a column item: fixed */
}

.ui-card__footer {
  justify-content: var(--ui-card-footer-align, flex-end);
}

.ui-card__body {
  /* display stays block on purpose: arbitrary content needs normal flow */
  flex: 1 1 auto;                /* as a column item: takes the slack */
  min-height: 0;                 /* without this it will not shrink and overflows the cap */
  max-height: var(--ui-card-body-max-height, none);
  overflow: auto;
}
```

The rest of Task 3 is unchanged — the pre-upgrade rule, the separator rule, the `:empty` rule, per-section padding, and the existing knobs.

**One interaction to check when writing it:** `.ui-card [data-outlet]:empty { display: none; }` must keep beating `.ui-card__header { display: flex; }`. As written it does, on specificity — three simple selectors against one. Do not "simplify" the hide rule to `[data-outlet]:empty` or an empty header will render as a flex row of nothing.

**Knobs after this change:** `--ui-card-padding`, `--ui-card-gap`, `--ui-card-radius`, `--ui-card-border-width`, `--ui-card-border-color`, `--ui-card-background`, `--ui-card-body-max-height`, `--ui-card-footer-align`.

## 5. Costs to own

- **`overflow: auto` makes the body a scroll container unconditionally**, which clips anything a child renders outside it — a tooltip or menu opened from within the body would be cut. The host already carries `overflow: hidden`, so this narrows an existing constraint rather than adding one. A component that needs to escape it belongs in the top layer, not in a looser rule here.
- **A scroll container with no focusable content is not reliably keyboard-scrollable across browsers.** Behaviour has changed in recent years and should not be assumed in either direction. Manual pass, not an assertion.
- **`flex-end` is a visual opinion shipped in the library.** The knob is the escape hatch, and its existence is what makes the opinion acceptable.

## 6. Why there are no new tests

`docs/testing.md` §3: never assert on computed layout, because **jsdom performs no layout**. Every change here is a declaration whose effect is geometric. There is nothing honest to assert — not the computed `display`, not `scrollHeight`, not the resolved value of a custom property that only matters once something is laid out.

The verification is the sandbox case in §7 and the manual pass. That is the rule working, not a gap.

## 7. Edits to apply to `docs/ui-card-plan.md`

**§3, In list** — add: `--ui-card-body-max-height` and `--ui-card-footer-align` as public knobs; row layout for the header and footer outlets.

**§3, Out list** — remove `--ui-card-body-max-height`, and replace the bullet explaining its absence with:

> **`--ui-card-body-max-height` is in, and so is a second, independent path to the same result.** A consumer may cap the card's own host instead and let the body take the slack; `widget-popover` does exactly that. Neither makes the other redundant — the inside knob works with no constrained ancestor, the outside one needs no API.

**Task 3** — replace the section rules with §4 above, including the specificity note.

**Task 4, sandbox demo** — add three cases: a card inside a fixed-height container with a long body (header and footer stay put, body scrolls, separators do not scroll away); the same effect via `--ui-card-body-max-height` on a card with no constrained ancestor; and a footer with two buttons, plus one with `--ui-card-footer-align: flex-start`.

**§10, Open questions** — delete the `--ui-card-body-max-height` entry. The other two stand: the shared token tier is still unanswered and still blocks Task 3, and the `:empty` whitespace note is unaffected.

**§11, Done** — add to the manual pass: with the height constrained by either route, the body scrolls while the header and footer do not, the body is reachable by keyboard scrolling, and footer actions sit where the default says they should.

## 8. Done

The card's gates are unchanged: `pnpm test`, `pnpm typecheck`, `pnpm lint`. This amendment adds no test, so its evidence is the sandbox cases in §7 and the lines added to §11.