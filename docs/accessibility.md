# Accessibility

Read before writing any interactive component. Accessibility is the component's keyboard and semantics contract — for anything structural it is designed first, not added afterwards.

Accessibility is not abstraction — it is part of "works". Never trade it for brevity. What the pragmatic mantra rules out here is inventing behaviour the pattern does not call for.

## 0. What can be added later, and what cannot

"Designed first" is not all-or-nothing, and treating it that way makes the rule easy to dismiss. The honest split:

**Add later, cheaply — it is a layer on top of correct structure:**

- A missing `aria-label` or `aria-describedby`.
- `:focus-visible` styling nobody wrote.
- `aria-live` on a status area.
- Contrast and visible-state fixes.
- A new state attribute on a component already built on the right element — `aria-pressed` on a button that wraps a real `<button>` is a property and three lines.

**Cannot be added later — it *is* the structure:**

- **Which element is the control.** A `<div>` painted where a native control exists cannot be fixed with ARIA; adding `role="button"` promises behaviour the element does not have, which is worse than no role. Rewriting is the only fix.
- **Where focus lives.** Roving tabindex dictates the DOM shape — what is an item, what is a container, what may contain a focusable. It does not bolt on.
- **Where state lives.** State belongs in the ARIA attribute with the visual derived from it (§7). A component built the other way round — a `.active` class as the source of truth — needs two sources kept in sync once ARIA arrives, which is the bug the rule exists to prevent.
- **The keyboard model.** Delegated at the container or not. Per-item listeners have to be undone to change it.

**The one decision to get right early**, from which most of the rest stays cheap: **use the native element the pattern calls for, and let state live in ARIA.** Get that right and almost everything else can be added when the requirement appears. Get it wrong and almost nothing can.

## 1. Start from the APG pattern

Find the matching WAI-ARIA Authoring Practices pattern (button, checkbox, disclosure, listbox, combobox, tree view, tabs, toolbar, dialog…) and follow it. Name the pattern in a comment at the top of the component. If no pattern matches, the component is probably two components — or **no pattern at all**: static or form-like content (a panel of labelled controls, a legend, a settings form) is plain semantic HTML in natural tab order. An APG pattern is for composite interaction, not for every repeated list; no ARIA is better than wrong ARIA.

The pattern is chosen per component, from the behaviour the component actually has — not from a default. The rules below constrain how a pattern is implemented; they do not pick it for you.

## 2. Write the keyboard contract before the code

List every key and what it does, including the boundaries: first/last item, collapsed vs expanded, disabled, empty state. Put the list in the component's plan or a comment. This is the specification the tests assert against.

Rules that always hold:

- `preventDefault()` on every key the component handles, so the page does not also scroll or submit. Only on keys it handles — a key the component ignores must stay available to the platform and to the page.
- No wraparound unless the pattern calls for it.
- Focus moves synchronously in the handler.
- **Where the visual order differs from DOM order** (a reversed flex direction, a grid), arrow keys, `Home`, and `End` follow **what the user sees**. A right arrow that moves focus leftward is a usability bug, not a technicality. The component must therefore own the CSS that reorders it — an external stylesheet reversing the axis behind the component's back desynchronises keyboard from layout silently.

## 3. Pick the focus model — the one big fork

**Single control** (button, checkbox, toggle, slider): use the native element, natural tab order, no ARIA needed beyond a name and its state. Do not reimplement what the platform gives you.

**Composite widget** (toolbar, tabs, radiogroup, tree, listbox, grid, menu): the container owns the keyboard model.

- The whole widget is **one Tab stop**. Exactly one item has `tabindex="0"`; every other has `tabindex="-1"`. Arrow keys move it (roving tabindex).
- All interaction is **delegated at the container** (`keydown`, `click`, `focusin`), resolving `target.closest('<item-tag>')`. Dumb items carry no listeners.
- Sync the roving tab stop on `focusin` so mouse clicks and keyboard stay consistent.
- The initial tab stop is the **first item in visual order**, or the selected/pressed one if there is one.

### 3.1 Focusable elements inside a composite widget

The rule that matters is not "never a focusable inside an item" — it is **whether the item is the control or merely contains one**.

**The item *is* the control — allowed.** Toolbar, tabs, radiogroup. The items are real `<button>`s, tabs, or radios, and they carry the roving tabindex themselves. There is one focus target per item and it is the item, so nothing competes.

**The item *contains* a control — forbidden.** Listbox, tree, grid. An `<input>`, `<button>`, or `<a href>` placed inside an item creates a **second tab order** competing with the roving one: content reachable only by Tab, and Tab jumping clear of the widget. This is the failure mode that motivates the rule — a native checkbox inside a roving-tabindex row is the bug it came from.

In the forbidden case, interactive-looking parts are **state on the item, not controls in it**: state in an ARIA attribute on the item, visual in an `aria-hidden` `<span>` styled from `data-state`, action bound to a key the container handles.

The test to apply: *after adding this element, how many focus targets does one item have?* One → fine. Two → the bug.

### 3.2 Widgets inside widgets

**Focus models do not nest.** By default, composing widgets is layout, not coordination: each composite keeps its own single Tab stop and its own arrow keys, and **Tab is the inter-widget key**. A widget inside a tabpanel, a panel, or a disclosure section is simply the next tab stop — nothing to design. Two mechanical guards keep an outer composite's delegated `keydown` honest when something focusable legitimately sits inside it: bail if `event.defaultPrevented` (an inner widget already claimed the key — §2 guarantees it called `preventDefault()`), and bail if the target is a text-entry control (`input`, `textarea`, `contenteditable`), where arrows move the caret natively and the user leaves with Tab.

A widget inside a **roving item** stays forbidden by §3.1. The APG shapes that permit it — grid/treegrid with an interaction mode (Enter descends into the cell, Esc restores the roving), toolbar with axis-partitioned keys, menu with submenus — are designed from the pattern when a real component needs one, not before.

**A "tree" whose items need embedded controls is usually not the Tree pattern.** Model it as a nested disclosure list: real disclosure `<button>`s carrying `aria-expanded`, per-item controls as **siblings of the button** — never inside it, since interactive content inside a `<button>` is invalid — everything in natural tab order. Heuristic: count the focus targets one item needs. One → roving Tree, state as ARIA on the item. Several → disclosure list. Several *and* arrow navigation indispensable at scale → treegrid interaction mode, the expensive answer. A component commits to **one** focus model; it never switches by flag.

## 4. Roles and semantics

- Role goes on the host element (`role="listbox"` on the container, `role="option"` on items). Use the pattern's roles; do not invent.
- **A widget with a composite keyboard model needs the matching role.** Behaviour without semantics is the mirror of the bug in §7: the widget behaves as one Tab stop while a screen reader announces loose controls, so the user's expectation and the interaction disagree. If the behaviour is a toolbar, the role is `toolbar`.
- **A role that names a grouping needs an accessible name.** `role="toolbar"`, `role="group"`, `role="radiogroup"` announce as an unnamed container otherwise, which is noise. Accept `aria-label` / `aria-labelledby` and warn in dev when neither is present.
- Do not mix conflicting state vocabularies (e.g. `aria-checked` and `aria-selected` on the same item) — screen-reader output becomes contradictory. `aria-pressed` (toggle) and `aria-checked` (exclusive choice) are likewise a choice, not a pair: pick from the behaviour, since a set that can end up with nothing selected is toggles, and one that cannot is radios.
- A state attribute is written **only when the state applies**. `aria-pressed="false"` on a plain button announces it as a toggle; absence of the attribute is the correct way to say "not a toggle".
- Positional attributes (`aria-level`, `aria-setsize`, `aria-posinset`) are stamped synchronously when the structure is built and re-stamped by whatever changes it.
- `aria-orientation` is supported by `toolbar`, not by `group` — another reason the role follows the behaviour. It carries only `horizontal` or `vertical`; a visually reversed axis is presentation and is not reported.
- Decorative parts (icons, twisties, custom boxes) are `aria-hidden="true"` and never focus targets.

## 5. Content regions

Consumer-supplied content is presentation. The component keeps ownership of meaning.

- **The component sets roles and state**, never the supplied node. A consumer filling a region must not be able to change what the component *is*. The same holds for a container and its children: a group that needs its items to carry state exposes a property on the item and calls it — it does not write ARIA onto nodes it does not own.
- **Never rely on region content for the accessible name.** A component whose name would come from a region must accept `aria-label` / `aria-labelledby` and apply a sensible default, because the consumer may supply an icon alone. Icon-only usage is the case to design for, not the exception.
- **Decorative outlets are `aria-hidden="true"`** in the skeleton (an icon outlet, a twisty), so whatever lands there is excluded from the accessibility tree.
- **Composite widgets take per-item content as strings via callback only — never nodes**, in the patterns where §3.1 forbids focusables inside items. Where the item *is* the control (a toolbar of buttons), the consumer supplies the controls themselves and this restriction does not apply.
- An unfilled outlet stays in the DOM, empty and hidden by CSS; empty and unlabeled, it surfaces nowhere in the accessibility tree.

## 6. Accessible name

- Forward a consumer-supplied `aria-label` / `aria-labelledby` on the host; otherwise apply a sensible default.
- **Where the host is not the control**, forwarding is mandatory, not optional: a name on a non-focusable wrapper is never announced. Forward the whole ARIA set the component supports, from a declared list, and observe those attributes so a name set after render still lands.
- Name an item from **its own** label, not its descendants: point `aria-labelledby` at the id of the item's content wrapper.
- Every ARIA relationship needs a unique id — use the shared id helper in `src/lib/core/`. Light DOM means ids are global; collisions are silent and break naming.

## 7. State and visuals

- State lives in the ARIA attribute; the visual is derived from it in CSS (`[aria-expanded="false"]`, `[aria-pressed="true"]`, `[data-state="mixed"]`). Never the reverse, and never a JS-set inline style as the source of truth.
- Hiding a control with CSS alone is a bug: if the item still carries the ARIA state and still responds to the key, screen-reader users hear a control sighted users cannot see. Gate rendering, ARIA, and behaviour together.
- Collapsed content that stays in the DOM must be hidden with `display: none` (or `hidden`), so it leaves the accessibility tree too.

## 8. Focus visibility

- Style `:focus-visible`, using the shared focus-ring token.
- Never remove an outline without providing a replacement of at least equivalent contrast.

## 9. Disabled items

- A native `disabled` control **cannot receive focus** — that is platform behaviour, not a choice. Roving tabindex therefore skips disabled items when computing a move target.
- If every item is disabled there is nowhere to put `tabindex="0"` and the widget leaves the tab order. That is correct; recognise it as a defined state rather than a crash.
- If the item holding the tab stop becomes disabled, recompute the tab stop.

## 10. Checklist before done

- [ ] APG pattern identified and followed.
- [ ] Keyboard contract written down and fully implemented, boundaries included.
- [ ] One Tab stop for composite widgets; exactly one `tabindex="0"` after every operation.
- [ ] Focus targets per item counted: one, not two (§3.1).
- [ ] Roles, states, and positional attributes correct and updated by every mutation; state attributes absent when the state does not apply.
- [ ] Accessible name present, scoped, and forwardable; survives icon-only content; ids unique. A named-grouping role has a name.
- [ ] Decorative parts and decorative outlets `aria-hidden`.
- [ ] `:focus-visible` styled.
- [ ] Disabled/empty/loading states have defined semantics.
- [ ] Keyboard direction matches visual order, including reversed layouts.

## 11. Limit of automated checks

Tests confirm roles, attributes, and events. They cannot confirm what a screen reader announces. Do a manual pass with a real screen reader on the keyboard contract when a component is new or its semantics change — especially at the boundaries listed in §2.