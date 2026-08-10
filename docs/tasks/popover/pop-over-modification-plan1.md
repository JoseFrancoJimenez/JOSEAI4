# widget-floating-panel — modification plan

Migration of the existing `widget-popover` off the platform Popover API and onto container-relative absolute positioning, plus a rename.

Read with: the `web-components` skill, `docs/accessibility.md` (§1, §7), `docs/testing.md`, `docs/regions.md`.

> **The code already exists.** This is a modification plan, not a build plan. Each step names what changes, what is deleted, and what its tests must say afterwards.

---

## 0. Why

The panel must sit inside a container (a map, a sidebar, anything) and stay within it. It cannot.

An open popover is promoted to the **top layer**, and a top-layer element resolves its containing block against the **initial containing block — the viewport** — regardless of where it sits in the DOM. Reparenting it into the container changes nothing, and neither does app CSS: `inset: 1rem` on a top-layer host means 1rem from the *window's* edge, not the container's. The panel therefore overflows its container, and a `show()`-time clamp only patches the moment of opening — it cannot track a container that later resizes.

CSS anchor positioning was evaluated as an alternative: it does re-tether a top-layer element to a normal-flow element, it is live across resize, and it is now supported across all major engines. It was rejected because it solves placement only. It does not give the container the ability to clip the panel, and it keeps the panel in the top layer — outside the container's stacking and overflow context — for a component whose defining requirement is now to live *inside* something.

`position: absolute` inside a positioned ancestor resolves both problems structurally rather than by correction: coordinates are container-relative by definition, the panel moves with the container on resize with no JavaScript, and the consumer can clip with `overflow: hidden` if they want to.

**Reusability constraint:** the panel is used outside maps. It must know nothing about maps, and nothing about which element contains it. The contract is "coordinates are relative to my offset parent" — making that ancestor positioned is the consumer's job.

## 1. Ordering rule

**Step 2 is a pure rename with zero behaviour change, and its tests must be green before Step 3 starts.** Folding the rename into the positioning rewrite makes every diff unreadable and hides real regressions in noise.

## 2. Rename (mechanical, no behaviour change)

| From | To |
|---|---|
| `src/lib/widgets/popover/` | `src/lib/widgets/floating-panel/` |
| `widget-popover.ts` / `.css` / `.test.ts` | `widget-floating-panel.ts` / `.css` / `.test.ts` |
| `widget-popover-dom.ts` | `widget-floating-panel-dom.ts` |
| tag `widget-popover` | `widget-floating-panel` |
| `WidgetPopoverElement` | `WidgetFloatingPanelElement` |
| `WidgetPopoverRegion` | `WidgetFloatingPanelRegion` |
| `--widget-popover-x` / `-y` / `-width` / `-max-height` | `--widget-floating-panel-*` |
| `cls` block, `HTMLElementTagNameMap` entry | follow the tag |
| `.widget-popover__close`, `__live` | `.widget-floating-panel__close`, `__live` |
| `src/apps/sandbox/widget-popover.html` | `src/apps/sandbox/widget-floating-panel.html` |
| `docs/pop-over.md` | `docs/widget-floating-panel-plan.md` |

Per `docs/plan.md` §4 (single owner, one workspace) this is a straight break: **no aliases, no deprecation shims.** Every consumer updates in the same change.

**Done when:** the existing suite passes unchanged apart from the renames, plus `pnpm typecheck` and `pnpm lint`.

## 3. Remove the Popover API

- Drop `popover="manual"` from `connectedCallback`.
- Delete `showPopover()` / `hidePopover()` / `togglePopover()` calls, the `:popover-open` matching, and the `beforetoggle` / `toggle` host listeners.
- **Delete the jsdom spike (old Task 1) and any Popover stub in the Vitest setup file.** Nothing in this component is unobservable in jsdom anymore, so assertions previously deferred to the manual pass return to the suite.
- Delete from the CSS: the `:popover-open` display trap, the `margin: 0` UA-centering defusal, the unpositioned `1rem` fallback that existed only to defuse it, `::backdrop`, and the viewport clamp in `show()`.

## 4. State becomes ours — `open` is the source of truth

The old plan's §2 claim — *"the open/closed state is deliberately not ours; it lives in the platform"* — inverts. Rewrite it rather than deleting it, so the reversal is legible.

- **`open` is a reflecting, observed attribute and the single source of truth.** CSS derives from `[open]` (`docs/accessibility.md` §7). The original objection to an `open` setter was that it would be a second channel beside `show()`/`hide()`; with the attribute as the one truth that objection dissolves — `show()` / `hide()` / `toggle()` become thin wrappers that set or remove it, and `attributeChangedCallback` runs the side effects (group close, focus restoration). Same shape as `<details open>`.
- Guard re-entry: if the attribute already matches the target state, do nothing.
- `<widget-floating-panel open>` in initial markup now works for free.
- **Hiding when closed is our job now.** `display: none` under `:not([open])` — never `visibility` or `opacity`, so closed content leaves the accessibility tree and stops being focusable (`docs/accessibility.md` §7).

## 5. A state-change event

The old §3 said "no `CustomEvent` of any kind", justified by consumers observing the native `toggle` event. That event no longer exists, so consumers would have nothing to listen to — which breaks props-down / events-up (`CLAUDE.md`).

- Add `widget-floating-panel:toggle`, `detail: { open }`, bubbles.
- **User-driven change emits** (close button, `Escape`). **Commands do not emit** (`show()`, `hide()`, `toggle()`) — the `docs/testing.md` §4 rule applied everywhere else in this repo.

## 6. Positioning

- `position: absolute` on the host; `inset` unset by default.
- **`positionAt(x, y)` coordinates are relative to the offset parent**, not the viewport. This is a contract change. It still writes `--widget-floating-panel-x` / `-y` and nothing else; the placement rule stays in the stylesheet.
- **Dev-only guard:** on first open, if `this.offsetParent` is null or `document.body`, `console.error` naming the tag and explaining that the panel has no positioned ancestor so coordinates resolve against the page. This is the most likely integration mistake and it is silent otherwise. Stripped in production.
- **New knob `--widget-floating-panel-z-index`**, with a sane default. The top layer gave stacking immunity for free; inside a container the panel competes with whatever the host app stacks — for the GIS app, the map engine's own controls. Verify in the sandbox.
- **Clipping is the consumer's decision**, not ours: `overflow: hidden` on their container clips the panel, `visible` does not. Document it; do not decide it.
- Static placement still needs no API — an app positions a tool panel by styling the host (`widget-floating-panel.tools { inset: 1rem 1rem auto auto; }`), and because `inset` is a live relationship it now follows the container across resize with no JavaScript at all.
- Retained unchanged: `--widget-floating-panel-max-height` caps the host and `ui-card`'s body takes the slack and scrolls.

## 7. Focus, Escape, groups

- **Focus restoration collapses into `hide()`.** The `beforetoggle` / `toggle` split existed only to survive a native `showPopover()` call; there is no native path now. Capture `this.contains(document.activeElement)` and restore synchronously in one place. Behaviour is unchanged: restore only if the panel held focus, `#source` optional, a disconnected `#source` is a documented no-op.
- **`Escape`:** unchanged — host `keydown`, `preventDefault()` on that key only.
- **Groups:** logic unchanged, hook moves from `beforetoggle` to the open path. The DOM stays the registry — no module-level map.

## 8. Accessibility §7 rewrite

The current justification for having no role is *"the platform's popover semantics already describe this element."* Strip the attribute and there are no platform semantics; the justification has to be replaced or it dangles.

**Decision: still no role, new reason.** This is a container of content, not a widget with composite interaction — it has no keyboard model of its own beyond `Escape`, and its contents keep their own focus models (`docs/accessibility.md` §3.2). `role="region"` was considered and rejected: it would demand an accessible name the consumer may not have (`docs/accessibility.md` §4), and a landmark for a transient tool panel is noise. `no ARIA is better than wrong ARIA` (§1).

Unchanged: no `aria-modal`, no `tabindex` on the host, opening never moves focus, the close button carries an `aria-label` from `close-label`, the `aria-live="polite"` body wrapper stays and `setContent('default', …)` still writes *into* it rather than over it.

## 9. Tests

**Delete:** every assertion on `popover="manual"`, `:popover-open`, `beforetoggle` / `toggle`, and the Popover stub.

**Add:**

- `open` reflects both ways and clears; setting it directly opens and closes.
- `<widget-floating-panel open>` in markup renders open.
- A closed panel's content is not focusable.
- `positionAt` writes the renamed custom properties; calling it again replaces them.
- The no-positioned-ancestor dev error fires; it does not fire when a positioned ancestor exists.
- A user gesture emits `widget-floating-panel:toggle` once with `detail: { open }`; `show()` / `hide()` / `toggle()` do not emit.

**Now testable that were not:** the full open/close cycle and focus restoration, with no jsdom caveats and no deferral to the manual pass.

**Still not testable — sandbox only:** actual placement, containment, and z-order. jsdom performs no layout (`docs/testing.md` §3).

Everything else in the existing suite — regions, `setContent` into the live wrapper, close-button wiring, groups, move/re-render, HTML and programmatic instantiation — stays as-is.

## 10. Sandbox pass

Update `src/apps/sandbox/widget-floating-panel.html`: the background stand-in becomes a **positioned, resizable** container. Verify by hand:

- The panel stays inside the container, including near its edges.
- Resizing the window keeps a CSS-placed panel correctly placed, with no JavaScript involved.
- `overflow: hidden` on the container clips the panel; `visible` does not.
- The panel sits above the map engine's controls and below app-level chrome.
- The keyboard pass from the old plan, unchanged: Tab in and out, `Escape` from inside closes and restores focus, `Escape` from outside does nothing, the background stays interactive, group auto-close does not steal focus.

## 11. Doc fallout

- **`docs/rationale.md`** — add the reversal: why the Popover API was chosen, why container-relative absolute positioning replaced it, and why anchor positioning was evaluated and rejected. Without this someone re-proposes the top layer in six months.
- **`docs/pop-over.md` §9** — delete the `:popover-open` display trap feedback item; it is no longer a real trap.
- **`docs/ui-button-plan.md` §3** — delete the "forwards no `popovertarget`" note; its only rationale was a possible `popover="auto"` revisit.
- **`docs/plan.md` §4** — if the widget-folder naming question (`widgets/popover/` vs `elements/ui-button/`'s full-tag form) is still open, settle it here, since this change renames the folder anyway.
- Still true and kept: this remains the first widget with no `setup()`.

## 12. Open questions

- **Re-clamp when the container shrinks.** Deliberately out of v1. With absolute positioning the panel moves with its container, so the original bug is gone; what remains is that a panel placed near the far edge via `positionAt` can fall outside a container that later shrinks a lot. Only affects `positionAt`, not CSS-placed panels. If a real consumer hits it, add a `ResizeObserver` — and store the **original requested** `x`/`y`, because re-clamping from an already-clamped value drifts the panel into the corner on every resize.

## 13. Done

Per step: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

For the component overall: the checklist in `docs/accessibility.md` §10 walked with its N/As recorded, plus the manual pass in §10 above.