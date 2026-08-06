# Accessibility

Read before writing any interactive component. Accessibility is the component's keyboard and semantics contract — it is designed first, not added afterwards.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.** Accessibility is not abstraction — it is part of "works". Never trade it for brevity. What the mantra rules out here is inventing behaviour the pattern does not call for.

## 1. Start from the APG pattern

Find the matching WAI-ARIA Authoring Practices pattern (button, checkbox, disclosure, listbox, combobox, tree view, tabs, dialog…) and follow it. Name the pattern in a comment at the top of the component. If no pattern matches, the component is probably two components.

## 2. Write the keyboard contract before the code

List every key and what it does, including the boundaries: first/last item, leaf vs branch, collapsed vs expanded, empty state. Put the list in the component's plan or a comment. This is the specification the tests assert against.

Rules that always hold:

- `preventDefault()` on every key the component handles, so the page does not also scroll or submit.
- No wraparound unless the pattern calls for it.
- Focus moves synchronously in the handler.

## 3. Pick the focus model — the one big fork

**Single control** (button, checkbox, toggle, slider): use the native element, natural tab order, no ARIA needed beyond a name. Do not reimplement what the platform gives you.

**Composite widget** (tree, listbox, tabs, grid, menu): the container owns the keyboard model.

- The whole widget is **one Tab stop**. Exactly one row/item has `tabindex="0"`; every other has `tabindex="-1"`. Arrow keys move it (roving tabindex).
- **No native focusable element inside an item.** An `<input>`, `<button>`, or `<a href>` inside a row creates a second tab order competing with the roving one — content reachable only by Tab, and Tab jumping clear of the widget. This is the failure mode that motivates the rule.
- Interactive-looking parts are therefore **state on the item, not controls in it**: state in an ARIA attribute on the item, visual in an `aria-hidden` `<span>` styled from `data-state`, action bound to a key the container handles.
- All interaction is **delegated at the container** (`keydown`, `click`, `focusin`), resolving `target.closest('<item-tag>')`. Dumb items carry no listeners.
- Sync the roving tab stop on `focusin` so mouse clicks and keyboard stay consistent.

## 4. Roles and semantics

- Role goes on the host element (`role="tree"` on the container, `role="treeitem"` on rows). Use the pattern's roles; do not invent.
- Do not mix conflicting state vocabularies (e.g. `aria-checked` and `aria-selected` on the same item) — screen-reader output becomes contradictory.
- Positional attributes (`aria-level`, `aria-setsize`, `aria-posinset`) are stamped synchronously when the structure is built and re-stamped by whatever changes it.
- Decorative parts (icons, twisties, custom boxes) are `aria-hidden="true"` and never focus targets.

## 5. Slot content

Consumer-supplied content is presentation. The component keeps ownership of meaning.

- **The component sets roles and state**, never the slotted node. A consumer dropping an element into a slot must not be able to change what the component *is*.
- **Never rely on slot content for the accessible name.** A component whose name would come from a slot must accept `aria-label` / `aria-labelledby` and apply a sensible default, because the consumer may supply an icon alone. Icon-only usage is the case to design for, not the exception.
- **Decorative outlets are `aria-hidden="true"`** in the skeleton (an icon outlet, a twisty), so whatever lands there is excluded from the accessibility tree.
- **No focusable content inside a composite item** — this applies to slot content too, and the consumer cannot be trusted to know. A component that slots into a roving-tabindex item documents the restriction and, where it matters, neutralises what it received.
- **An outlet with no content and no default is removed**, not left empty — an empty element can still take space and surface as a node.

## 6. Accessible name

- Forward a consumer-supplied `aria-label` / `aria-labelledby` on the host; otherwise apply a sensible default.
- Name an item from **its own** label, not its descendants: point `aria-labelledby` at the id of the item's content wrapper.
- Every ARIA relationship needs a unique id — use the shared id helper in `src/lib/core/`. Light DOM means ids are global; collisions are silent and break naming.

## 7. State and visuals

- State lives in the ARIA attribute; the visual is derived from it in CSS (`[aria-expanded="false"]`, `[data-state="mixed"]`). Never the reverse, and never a JS-set inline style as the source of truth.
- Hiding a control with CSS alone is a bug: if the item still carries the ARIA state and still responds to the key, screen-reader users hear a control sighted users cannot see. Gate rendering, ARIA, and behaviour together.
- Collapsed content that stays in the DOM must be hidden with `display: none` (or `hidden`), so it leaves the accessibility tree too.

## 8. Focus visibility

- Style `:focus-visible`, using the shared focus-ring token.
- Never remove an outline without providing a replacement of at least equivalent contrast.

## 9. Checklist before done

- [ ] APG pattern identified and followed.
- [ ] Keyboard contract written down and fully implemented, boundaries included.
- [ ] One Tab stop for composite widgets; exactly one `tabindex="0"` after every operation.
- [ ] No native focusable element inside a composite item.
- [ ] Roles, states, and positional attributes correct and updated by every mutation.
- [ ] Accessible name present, scoped, and forwardable; ids unique.
- [ ] Decorative parts and decorative outlets `aria-hidden`.
- [ ] Accessible name survives icon-only slot content.
- [ ] `:focus-visible` styled.
- [ ] Disabled/empty/loading states have defined semantics.

## 10. Limit of automated checks

Tests confirm roles, attributes, and events. They cannot confirm what a screen reader announces. Do a manual pass with a real screen reader on the keyboard contract when a component is new or its semantics change — especially at the boundaries listed in §2.
