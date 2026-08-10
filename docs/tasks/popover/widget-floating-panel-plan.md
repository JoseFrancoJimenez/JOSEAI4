# widget-floating-panel — plan and tasks

Read the `web-components` skill before starting, `docs/accessibility.md` before touching focus/keyboard/ARIA, and `docs/regions.md` before touching content regions. This file specifies only what is specific to `widget-floating-panel`; everything else is in the skill.

> **Depends on two library components.** It composes `ui-card` for its frame and `ui-button` for its close control (skill §11: reach for a library component first). Neither may be modified to suit this widget without a note in §11.

> **This is the current spec, not a build log.** The widget originally shipped as `widget-popover`, built on the platform Popover API. It was renamed and rebuilt onto container-relative `position: absolute` once a real requirement — living inside a resizable map container — proved the top layer structurally incompatible with it. The "why" for that reversal, including the rejected alternatives, lives in `docs/rationale.md` under "Popover API replaced by container-relative positioning"; this file describes what the widget *is* today.

---

## 1. Goal

A widget `<widget-floating-panel>`: a **non-modal** floating panel, positioned with container-relative `position: absolute` rather than the platform Popover API. It holds header / body / footer content, carries its own close button, opens and closes on command, and can be positioned against its offset parent.

One component covers both foreseen uses, because they differ only in placement and payload:

- A **tool panel** over a map, opened by one of a row of buttons, statically placed by app CSS.
- A **feature popup**, opened on a map click and placed at a point relative to its container.

**Non-modal is the whole premise.** The background must stay live: the map keeps panning, the button row keeps taking clicks, and the button that opened the panel must be able to close it. Anything that must genuinely block the page is a different component built on `<dialog>.showModal()` — not a flag on this one (`docs/accessibility.md` §3.2: a component commits to one focus model and never switches by flag).

## 2. Classification

**Widget.** Strip external input and things remain: **which element to return focus to** when it closes, and **the decision, at open time, to close its group siblings**. `toggle()` also reads current state to decide what to do. Therefore `src/lib/widgets/floating-panel/`, `widget-` prefix.

**`open` is a reflecting, observed attribute and the single source of truth.** CSS derives from `[open]` (`docs/accessibility.md` §7). `show()` / `hide()` / `toggle()` are thin wrappers that set or remove it; `attributeChangedCallback` runs every side effect that follows from opening — the dev-only positioned-ancestor guard, closing group siblings, moving focus onto the panel (§8). Same shape as `<details open>`. Re-entry is guarded for free: `toggleAttribute` (the property setter) is already a no-op when the attribute already matches the target state.

**No `setup()`.** Skill §5 allows it: a widget fully configurable by attributes is ready without `setup()` ever being called. This one takes no injected dependency and no required data — content arrives through regions and `setContent`, which never gate readiness. So there is no readiness gate, no `#renderIfReady`, and no `#assertReady`; commands are meaningful once connected. This remains the first widget in the repo without a `setup()`.

MVVM level 2 (`docs/plan.md` §2): view-state inlined in the element, no ViewModel, no Model. There is no domain logic to extract — the only non-trivial rule is "which siblings to close," and it is extracted as a small pure function anyway (§8) because the DOM-free assertion is cheap to keep.

## 3. Scope

**In:** `open` as a reflecting attribute; `show(source?)` / `hide()` / `toggle(source?)`; group-based auto-close; focus moves to the panel's first focusable element when it opens, is trapped at both ends of its own content back to `source`, and restores to `source` on close, but only if the panel still held focus at that moment; `Escape`; a close button; `positionAt(x, y)` relative to the offset parent; three content regions forwarded to a `ui-card`; a persistent `aria-live` body wrapper; a `widget-floating-panel:toggle` event on user-driven close; a dev-only warning when the host has no positioned ancestor; a `--widget-floating-panel-z-index` knob.

**Out — do not build, do not leave hooks for:** modal mode; a backdrop with light-dismiss; edge flipping or a pointer/arrow tail; drag-to-move; resize; animation or transition API; anchoring to an element via CSS anchor positioning (evaluated and rejected — `docs/rationale.md`); nesting rules for panels inside panels; stacking order beyond what the z-index knob gives; RTL handling; clamping `positionAt` to stay inside its container. That last one is deliberately the consumer's job, not ours — see §14.

**Height has two routes, and this widget uses the one that needs no card API.** `--widget-floating-panel-max-height` caps the host; `ui-card`'s body then takes the slack and scrolls. The card also exposes `--ui-card-body-max-height` for consumers with no constrained host, which this widget does not need. See `docs/ui-card-plan-update.md`.

## 4. Public interface

```ts
export type WidgetFloatingPanelRegion = 'header' | 'default' | 'footer';

export class WidgetFloatingPanelElement extends HTMLElement {
  open: boolean;                                // reflecting attribute, the source of truth

  show(source?: HTMLElement): void;
  hide(): void;
  toggle(source?: HTMLElement): void;

  positionAt(x: number, y: number): void;       // relative to the offset parent, not the viewport
  setContent(region: WidgetFloatingPanelRegion, content: RegionContent): void;
}
```

Event: `widget-floating-panel:toggle`, `detail: { open: boolean }`, bubbles — **user-gesture only** (close button, `Escape`). Commands (`show()` / `hide()` / `toggle()`) never emit it (`docs/testing.md` §4).

Attributes: `open`, `group`, and `close-label`.

- **`show`, `hide`, `toggle` are ordinary methods, not bound fields.** The app wraps them (`() => panel.toggle()`), which is the natural way to write it and needs no help from us.
- **`source` is the element focus returns to.** Captured on `show()` / `toggle()` and used only when the panel held focus at close time (§8). Optional: a popup opened by a map click has no meaningful source.
- **`positionAt` writes custom properties, not state.** A coordinate is not state: nothing derives from it, it has no ARIA counterpart, and an attribute would thrash under repeated updates. Written as `--widget-floating-panel-x` / `--widget-floating-panel-y` on the host via `style.setProperty` so the placement rule itself stays in the stylesheet. Coordinates resolve against the host's **offset parent** — making that ancestor positioned is the consumer's job (§7).
- **Static placement needs no API.** An app positions a tool panel by styling the host: `widget-floating-panel.tools { inset: 1rem 1rem auto auto; }`. The host is public surface; what `docs/plan.md` §4 forbids is styling internal class names.
- **`setContent` never throws** and is exempt from any readiness check (skill §7). Unknown region names are ignored.
- **`<widget-floating-panel open>` in initial markup renders open**, for free — `open` is a reflecting attribute, so there is nothing else to wire.

Attribute notes:

- **`group`** — not observed. It is read at the moment the panel opens, so changing it in flight simply works, and there is nothing to react to in between.
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
- **Body** — a persistent `<div class="widget-floating-panel__live" aria-live="polite">`, passed to `card.setContent('default', …)` **exactly once**. Consumer body content is written *inside* it (§6).
- **Footer** — passed straight through.

`classList.add(cls.host)` is set on the host in `connectedCallback`, before harvest. The host itself carries no `tabindex`: it is never a focus target — the close button guarantees at least one focusable descendant, so opening always has somewhere real to send focus (§8).

**The close button is inside the header, not floating over the card.** The alternative — an absolutely positioned sibling of the card — was considered: simpler, but it overlays content, needs padding coordination, and lands last in reading and tab order. Inside the header it reads and tabs where a close control belongs. The consequence to accept: a panel with no header content still renders a header strip holding just the close button, because the close button is always header content and `ui-card` hides only genuinely empty sections.

## 6. Content regions

`regionNames = ['header', 'default', 'footer'] as const` in `widget-floating-panel-dom.ts`, type exported from `index.ts`. Same three names as `ui-card`, and mostly a pass-through — with one region that is not.

- **`header` and `footer` forward** to the card. `header` is wrapped with the close button first.
- **`default` does not forward directly.** A live region must exist in the accessibility tree *before* its content changes, so the element carrying `aria-live` cannot be the element being replaced. `setContent('default', …)` therefore writes **into** the persistent wrapper, never over it. This is the reason the widget owns a `setContent` at all instead of delegating blindly, and it is the one place where a future maintainer will be tempted to "simplify" it back into a bug.
- **A `<ui-button>` supplied in a region survives harvest and fill** (skill §7: detach, possible teardown microtask, reattach, reconnect). The close button is built in code so it never harvests, but the consumer may put library components in the header.
- Standard region behaviour otherwise: repeated names merge in document order, strings enter as text, `setContent(name, '')` clears, an unclaimed harvested name is a dev error from the helper (`docs/regions.md` §5) and this widget adds no warning of its own.

**Announcement ordering.** A live region inside a `display: none` subtree is not rendered, so content set while the panel is closed is unlikely to be announced when it opens. The documented order is **`show()` first, then `setContent('default', …)`**. Confirm it in the manual screen-reader pass (§13) — `docs/accessibility.md` §11 is explicit that tests cannot.

## 7. Positioning

- `position: absolute` on the host; `inset` unset by default.
- **`positionAt(x, y)` coordinates are relative to the offset parent**, not the viewport. It writes `--widget-floating-panel-x` / `-y` and nothing else; the placement rule stays in the stylesheet.
- **Dev-only guard:** on first open, if the host has no positioned ancestor (a computed-style walk up `parentElement`, not `offsetParent` — jsdom performs no layout and hard-codes `offsetParent` to `null`, `docs/testing.md` §3), `console.error` names the tag and explains that coordinates will resolve against the page. Stripped in production.
- **`--widget-floating-panel-z-index`**, default `10`. The top layer gave stacking immunity for free; inside a container the panel competes with whatever the host app stacks — for the GIS app, the map engine's own controls and any app-level chrome above it. Verify stacking order in the sandbox (§13).
- **Clipping is the consumer's decision**, not ours: `overflow: hidden` on their container clips the panel, `visible` does not. Document it; do not decide it.
- Static placement still needs no API — an app positions a tool panel by styling the host (`widget-floating-panel.tools { inset: 1rem 1rem auto auto; }`), and because `inset` is a live relationship it follows the container across resize with no JavaScript at all.
- `--widget-floating-panel-max-height` caps the host and `ui-card`'s body takes the slack and scrolls.
- **No clamping of `positionAt` to the container.** A `show()`-time viewport clamp existed in the Popover-API version; it is deliberately gone. Containment is the consumer's job via CSS, and re-clamping a resized container is an open question — see §14.

## 8. Focus, Escape, groups

- **Opening moves focus to the panel's first focusable descendant.** `attributeChangedCallback`'s open path calls `this.#focusableElements()[0]?.focus()` after the dev guard and group-sibling close. `#focusableElements()` queries `focusableSelector` (`widget-floating-panel-dom.ts`) in document order, which follows the card's own header → body → footer layout (§5), so "first" matches visual and tab order. The close button is always header content (§5), so this is never empty in practice — there is always at least one real target.
- **Tab is trapped at both ends of the panel's own content, but the two directions are deliberately asymmetric — and `source` itself gets a matching listener, so the round trip is fully reversible without looping.** A `keydown` listener on the host (same listener as `Escape`) checks, on `Tab`: with `source` connected, `Shift+Tab` from the *first* focusable descendant `preventDefault()`s and returns focus to `source` — "the element that had focus before the panel opened." Plain `Tab` from the *last* focusable descendant does **not** return to `source`; it continues to `#focusableAfterSource()`, the first focusable element in document order that comes after `source` and is not part of `source`'s own control or this panel's content. Separately, `#armSourceReentry()` attaches its own `keydown` listener directly on `source` (its own `AbortController`, armed in `show()`, torn down in `hide()`): plain `Tab` on `source` while the panel is open `preventDefault()`s and refocuses the panel's first element — so a user who tabbed out via `Shift+Tab` can tab straight back in. `Shift+Tab` on `source` is left native, continuing further back into the page. This combination is what makes re-entry safe: an earlier version paired "forward-exit from the panel returns to `source`" with "forward-Tab from `source` re-enters the panel," which is exactly a two-element loop (`source` ⇄ panel) with no way to `Tab` forward out of it at all. Because forward-exit instead goes to `#focusableAfterSource()` — skipping `source` — the loop can't form: `source` re-entry only ever runs when the user tabs *into* `source` deliberately (from before it, or back via `Shift+Tab` out of the panel), never as a side effect of leaving the panel forward. **With no connected `source`** — a popup opened by a map click, most commonly (§4) — none of this applies: no listener is armed on `source`, and both host-side directions are left alone.
- **Closing restores focus only if the panel held it.** Capture `this.contains(document.activeElement)` *before* `open` is cleared (closing takes the content out of the accessibility tree, per `docs/accessibility.md` §7), then restore synchronously in the same call. `Node.contains()` is true for the node itself, so the panel having focus via the point above is recognised correctly. `#source` optional: if present and still connected, it gets focus back; otherwise the previously focused element is blurred explicitly, so nothing is left stranded inside now-hidden content. If the panel did **not** hold focus when it closed — most commonly because something else (the button that triggered a group-sibling switch, a resize handler, any other app code) already moved focus elsewhere — nothing is touched. This is what makes group auto-close correct for free: when a sibling closes because this panel opened, focus has already moved to whichever control the user just activated, so the guard is false and no parasitic restoration happens.
- **`Escape`:** the same host `keydown` listener, `preventDefault()` on that key only — every other key stays available to the page and to any widget inside (`docs/accessibility.md` §2). Listening on the host rather than `document` is the whole implementation of "only when focus is inside."
- **Groups:** on the open path, close every other panel sharing the `group` attribute. **The DOM is the registry** — `document.querySelectorAll('.widget-floating-panel[group="…"]')` — no module-level map, nothing to register, unregister, or leak, no stale entries pointing at destroyed elements (`CLAUDE.md` keeps mutable global state out of `src/lib`). Selecting by the host class rather than the tag keeps it working under inheritance (skill §10). The group-sibling *decision* — which of a set of candidates should close — is extracted as a small pure function (`siblingsToClose`, exported), asserted with no DOM at all; only the candidate *selection* touches `document.querySelectorAll`.

## 9. Accessibility

**No role.** This is a container of content, not a widget with composite interaction — it has no keyboard model of its own beyond `Escape` and the Tab boundary trap (§8), and its contents keep their own focus models (`docs/accessibility.md` §3.2). `role="region"` was considered and rejected: it would demand an accessible name the consumer may not have (`docs/accessibility.md` §4), and a landmark for a transient tool panel is noise. No ARIA is better than wrong ARIA (`docs/accessibility.md` §1).

- **No `aria-modal`.** Nothing here blocks the page; the map keeps panning and the trigger row keeps taking clicks while a panel is open.
- **No `tabindex` on the host.** Unlike a genuinely empty container, this one always has a real focus target: the close button is always header content (§5), so `#focusableElements()[0]` never comes up empty and the host itself never needs to stand in.
- **Opening moves focus into the panel** (§8) rather than leaving it untouched. This is a departure from the platform's usual non-modal guidance (a notification or a persistent panel does not normally take focus even when it contains focusable elements) — the tradeoff accepted here is that keyboard and screen-reader users are told the panel arrived, at the cost of moving focus away from wherever it was, on every open.
- **Tab is trapped at both ends of the panel's content, asymmetrically, and `source` re-enters it** (§8) — a departure from the usual "non-modal means no trap" guidance, accepted for the same reason as the previous point: this widget's DOM position (reparented into the map container) carries no relationship to where it visually opens from, so letting Tab escape into natural DOM order would land focus somewhere arbitrary. `Shift+Tab` retraces the way in, back to `source`; `Tab` continues forward past `source` rather than looping back to it. `source` in turn refocuses the panel on a plain `Tab` while it is open, so the user can freely move back and forth between `source` and the panel's boundary — but because forward-exit never returns to `source`, that back-and-forth is always a deliberate reversal by the user, never an automatic bounce, so tabbing forward in one direction always makes progress and can never get stuck oscillating. With no `source`, none of this is armed and Tab behaves natively throughout.
- **Closing restores focus only if the panel held it** (§8) — restoring unconditionally would yank a user who has already moved on somewhere else back to the trigger.
- **The close button is icon-only**, so it carries an `aria-label` from `close-label`. `ui-button` already errors in dev when an icon-only button has no accessible name; this widget must not be the reason that fires.
- **The `aria-live` wrapper is `polite`**, never `assertive`. Feature information is not an alert.
- **Everything inside a panel keeps its own focus model** (`docs/accessibility.md` §3.2). The panel is layout, not coordination: it has no composite keyboard model of its own beyond `Escape` and the Tab boundary trap, so there is nothing to nest.

## 10. Files

```
src/lib/widgets/floating-panel/
  widget-floating-panel.ts
  widget-floating-panel.css
  widget-floating-panel-dom.ts   # cls map, regionNames, focusableSelector
  widget-floating-panel.test.ts
  index.ts                       # WidgetFloatingPanelElement + WidgetFloatingPanelRegion
src/apps/sandbox/
  widget-floating-panel.html     # demo page (§13)
```

Every file starts with `// AWESOME AI` (skill §14).

## 11. Feedback to the skill

- **First widget with no `setup()`.** Skill §5 allows it in one sentence but is written as though the gate is the norm — `#renderIfReady`, `#assertReady`, "getters return safe empties" all assume it. Worth a paragraph on the shape of a widget without a gate: what replaces `#assertReady`, and whether "commands require connection" needs a stated convention.
- **`ui-card` gets its first real consumer here.** Anything awkward in `setContent` — particularly the fragment-rebuild on every header write — goes back to `docs/ui-card-plan.md` §9, not around it.

## 12. Tests

`widget-floating-panel.test.ts` covers, in addition to the standard region/instantiation/move suite (`docs/testing.md` §7):

- `open` reflects both ways and clears; setting it directly opens and closes; `<widget-floating-panel open>` in markup renders open.
- A closed panel's content is not focusable (asserted where jsdom can — see the file's own note on its limits here, `docs/testing.md` §3).
- `positionAt` writes the custom properties; calling it again replaces them; no assertion on computed layout — jsdom performs no layout, so placement itself is verified in the sandbox (§13).
- The no-positioned-ancestor dev error fires on first open when there is no positioned ancestor; it does not fire when one exists.
- A user gesture (close button, `Escape`) emits `widget-floating-panel:toggle` once with `detail: { open }`; `show()` / `hide()` / `toggle()` never emit.
- `show()` moves focus to the first focusable element, header content before the close button when header content is focusable; with focus inside, `hide()` returns focus to `source`; with focus outside, `hide()` leaves focus where it is; with no `source`, or a `source` no longer connected, closing does not throw and blurs the previously focused element instead of stranding it.
- `Shift+Tab` from the first focusable element returns focus to `source` and `preventDefault()`s; `Tab` from the last focusable element goes to the element after `source` (not back to `source`) and `preventDefault()`s, or is left alone when nothing follows `source`; `Tab` from a focusable element in between is left alone; with no `source`, or a `source` no longer connected, `Tab` is left alone even at the edges.
- `Tab` on `source` itself, while the panel is open, `preventDefault()`s and refocuses the panel's first focusable element; `Shift+Tab` on `source` is left alone; after `hide()`, `Tab` on `source` no longer re-enters; with `source` already disconnected at `show()` time, `Tab` on it does not re-enter either.
- `Escape` from inside closes and restores focus; `Escape` dispatched outside the panel does nothing; a key the widget does not handle is not `preventDefault`ed.
- Opening a panel closes an open sibling in the same group; leaves other groups and ungrouped panels alone; changing `group` between opens takes effect immediately; closing a sibling this way does not steal focus back to its own source.
- `siblingsToClose` (the group-sibling decision) is asserted directly, with no DOM.

**Still not testable — sandbox only:** actual placement, containment, z-order, and the screen-reader announcement ordering in §6. jsdom performs no layout (`docs/testing.md` §3).

## 13. Sandbox — manual verification

`src/apps/sandbox/widget-floating-panel.html`, over a positioned, resizable background element standing in for a map (`#map { position: relative; resize: both; overflow: hidden }`, toggleable to `visible` to check clipping). Exercises: a row of buttons wired exactly as an app will wire them (`button.addEventListener('click', () => panel.toggle(button))`); two panels in one group and a third in another; one ungrouped; a header holding a real widget and a header holding plain text; a header-less panel (close button only); a body updated on a timer to watch the live region; `positionAt` driven by clicks inside the container; a low-z-index "map control" stand-in and a high-z-index "app chrome" stand-in bracketing the panel's default z-index; one panel with a deliberate `data-region` typo to see the helper's error.

Verify by hand:

- The panel stays inside the container, including near its edges.
- Resizing the container keeps a CSS-placed panel correctly placed, with no JavaScript involved.
- `overflow: hidden` on the container clips the panel; `visible` does not.
- The panel sits above the map engine's controls and below app-level chrome.
- Focus should already be on the panel's first focusable element immediately after it opens, before any Tab press. Continue Tab through its content, close button included; Tab from the last focusable element (or Shift+Tab from the first) should jump straight back to the trigger button, not wander into whatever else sits after the panel in the DOM.
- `Escape` from inside closes it and returns focus to its trigger button; `Escape` with focus outside does nothing; clicking the background never closes anything.
- Opening a group sibling does not disturb focus on the button that triggered it.
- A screen reader announces the close button's name and the live region's content, updated *after* the panel opens (§6).

This is where the API gets judged. If something feels awkward here, fix the design, not the demo.

## 14. Open questions

- **Re-clamp when the container shrinks.** With absolute positioning the panel moves with its container, so the original Popover-API bug (overflow relative to the *viewport*) is gone; what remains is that a panel placed near the far edge via `positionAt` can fall outside a container that later shrinks a lot. Only affects `positionAt`, not CSS-placed panels, and remains deliberately unaddressed in the widget itself — it is consumer-side containment territory (§7). If a real consumer needs live re-clamping, it needs a `ResizeObserver` and the **originally requested** `x`/`y` stored separately, because re-clamping from an already-clamped value drifts the panel into the corner on every resize. (`proto-all` sidesteps the whole problem at the app level by closing its click-positioned popup on resize instead of re-clamping it — a valid alternative for a consumer that doesn't need the panel to survive a resize.)

## 15. Done

Per change: `pnpm test` (closest suite), `pnpm typecheck`, `pnpm lint`.

For the component overall: the checklist in `docs/accessibility.md` §10 walked with its N/As recorded, plus the manual pass in §13.
