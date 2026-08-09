# ui-card — plan update: constrained height and the scrolling body

An amendment to `docs/ui-card-plan.md`. Apply it before Task 3; nothing here changes the component's classification, interface, or accessibility contract.

**Trigger.** `docs/ui-card-plan.md` §10 deferred `--ui-card-body-max-height` with the words *"decide when `widget-popover` is planned, not before."* That widget is now planned, so the question is due. The answer is **no knob** — and the reason it took until now to see is that the constraint turns out to come from the wrong direction.

---

## 1. What changed in the reasoning

The card plan assumed a consumer would ask the card to limit its own body. `docs/widget-popover-plan.md` Task 6 does the opposite: it caps **the popover host** with `--widget-popover-max-height`. The card is not being asked to know a height. It is being asked to **behave correctly as a flex column when something above it is constrained** — which is not public surface, it is being a correct flex column.

That reframing is the whole update. A knob would have added a public property, documentation, and a second way to express a constraint that already has one.

## 2. The change

Three declarations in `ui-card.css`:

```css
.ui-card__header, .ui-card__footer { flex: none; }
.ui-card__body { flex: 1 1 auto; min-height: 0; overflow: auto; }
```

`min-height: 0` is the load-bearing one and the one that gets dropped: without it a flex item refuses to shrink below its content size, so the body overflows the cap instead of scrolling inside it. Comment it, or it looks removable.

Inert until something constrains the card. Unconstrained, there is no overflow, `overflow: auto` shows no scrollbar, and `flex: 1 1 auto` on the only growing child changes nothing.

## 3. Costs to own

Two, and both belong in the plan rather than in a surprise later:

- **`overflow: auto` makes the body a scroll container unconditionally**, which clips anything a child tries to render outside it — a tooltip or a menu opened from inside the body would be cut off. The host already carries `overflow: hidden` (`docs/ui-card-plan.md` Task 3), so this narrows an existing constraint rather than introducing one. If a consumer ever needs to escape it, the answer is the top layer, not loosening this rule.
- **A scroll container with no focusable content inside it is not reliably keyboard-scrollable across browsers.** Behaviour here has changed in recent years and should not be assumed in either direction. This goes to the manual pass (§6), not to an assertion in the plan.

## 4. Why there is no test

`docs/testing.md` §3 is explicit: never assert on computed layout, because **jsdom performs no layout**. There is nothing meaningful to assert — no `getBoundingClientRect`, no `scrollHeight`, no computed `overflow` worth pinning. This is a CSS-only change verified visually.

That is not a gap to apologise for; it is the rule working. The verification moves to the sandbox and the manual pass.

## 5. Edits to apply to `docs/ui-card-plan.md`

**§3, Out list** — remove `--ui-card-body-max-height` from the out-of-scope items, and replace the bullet that explains it with:

> **A body height knob (`--ui-card-body-max-height`) was considered and rejected.** The constraint comes from the consumer's own host, not from the card: `widget-popover` caps its host and the card's body shrinks and scrolls under it (Task 3). A knob would be a second way to say the same thing, with public surface attached.

**Task 3, CSS** — add the three declarations from §2 above, with the `min-height: 0` comment.

**Task 4, sandbox demo** — add one case: a card inside a container with a fixed height, holding a long body, a filled header, and a filled footer. Confirm the header and footer stay put, the body scrolls, and the separators stay attached to the sections rather than scrolling away with the content.

**§10, Open questions** — delete the `--ui-card-body-max-height` entry. The other two entries stand: the shared token tier is still unanswered and still blocks Task 3, and the `:empty` whitespace discipline note is unaffected.

**§11, Done** — add to the manual pass: with the card height constrained, the body scrolls, the header and footer do not, and the body is reachable by keyboard scrolling.

## 6. Done

The card's own gates are unchanged — `pnpm test`, `pnpm typecheck`, `pnpm lint`. This amendment adds no test, so the evidence it works is the sandbox case in §5 and the manual line added to §11.