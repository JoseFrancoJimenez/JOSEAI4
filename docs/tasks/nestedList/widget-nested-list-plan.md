# widget-nested-list — plan

A nested list of **groups** and **leaves**. Groups expand and collapse; per-item content beyond the label is supplied by the app through render callbacks. First consumer: a GIS layer panel (groups of layers carrying visibility and opacity controls); the widget itself is domain-agnostic and knows nothing about layers.

Read with: the `web-components` skill, `docs/accessibility.md` (§1, §3.2, §5), `docs/testing.md`.

## 1. Classification and focus model

- **Widget** — it owns expansion state. `src/lib/widgets/nested-list/`, tag `widget-nested-list`, class `NestedListElement`. Complexity form 2 (`docs/plan.md` §2): the expansion `Set` is inlined in the element; no ViewModel — extraction earns its place only if non-trivial logic (filtering, search) ever arrives.
- **Focus model — committed: Disclosure (nested), not APG Tree View.** Top-of-file comment: `// APG pattern: Disclosure (nested) — not Tree View`. Natural tab order; the only keyboard behaviour is the native `<button>`'s Enter/Space. **No roving tabindex, no arrow keys, no `preventDefault()` anywhere.** Consequence: accessibility §3.1 does not apply, so render callbacks may return nodes — controls and other widgets included. This never switches by flag; a roving selection tree, if one is ever needed, is a separate component (accessibility §3.2).

## 2. Data in

`setup({ items, renderLeaf?, renderGroup?, expanded? })`. Items are **plain serializable data**; a group is an item with `children`.

```ts
interface NestedListLeaf  { id: string; label: string }
interface NestedListGroup { id: string; label: string; children: NestedListItem[] }
type NestedListItem = NestedListLeaf | NestedListGroup;

interface NestedListSetup {
  items: NestedListItem[];
  renderLeaf?:  (item: NestedListLeaf)   => Node | string | null;
  renderGroup?: (group: NestedListGroup) => Node | string | null;
  expanded?: 'all' | string[];   // default 'all'
}
```

- `id` is unique across the whole structure — dev-only `console.error` on duplicates (they break `aria-controls` and the expansion set).
- **The label is data, so the component owns the accessible name** (accessibility §5). Callbacks fill the per-item **extras** area only; they never replace the label.
- Callback output: a Node or fragment is inserted as-is; a string enters as `textContent`; `null` or an absent callback leaves the extras outlet empty (hidden by `:empty`).
- **Later data: `setItems(items)` command, surgical.** Diffed by id, level by level, against the currently rendered tree:
  - Unchanged items (same id, same label, same children ids/order, same expandable-ness) are left untouched — same DOM node, same listeners. Focus and scroll position inside the list survive a data refresh.
  - Changed items update in place: label text, extras re-invoked via the callback, children recursed.
  - Removed ids: node removed, dropped from the expansion `Set` and from `expandedIds`.
  - Added ids: node created; new group ids follow the `expanded` seed mode.
  - Reordering within a `children` array reorders the existing nodes with `insertBefore` — it does not recreate them.

## 3. Skeleton (per node)

```html
<li class="…group">
  <div class="…header">
    <button class="…disclosure" aria-expanded="true" aria-controls="<generated-id>">
      <span class="…twisty" aria-hidden="true"></span>
      <span class="…label">{label}</span>            <!-- textContent -->
    </button>
    <span class="…extras"></span>                    <!-- renderGroup output -->
  </div>
  <ul class="…children" id="<generated-id>">…</ul>
</li>

<li class="…leaf">
  <span class="…label">{label}</span>
  <span class="…extras"></span>                      <!-- renderLeaf output -->
</li>
```

- **Extras are siblings of the disclosure button, never inside it** — interactive content inside a `<button>` is invalid HTML (accessibility §3.2).
- The disclosure is a bare native `<button>` stamped by the widget, not `ui-button`: `ui-button` does not model `aria-expanded`/`aria-controls` or a twisty, and growing it for one consumer is the base-class-with-one-consumer mistake in mirror — skill §11 step 2 applies.
- Ids come from the shared id helper. Collapse sets `hidden` on the children `<ul>` (leaves the accessibility tree, accessibility §7); the twisty is styled from `[aria-expanded]` — state in ARIA, visual derived.

## 4. Behaviour

- One delegated `click` listener on the host resolving `target.closest('.' + cls.disclosure)`; clicks anywhere else — extras controls included — pass through untouched. The widget never intercepts, re-dispatches, or `preventDefault`s events from extras content; the app listens to its own controls (they bubble through light DOM as native events already do).
- **User toggle emits** `widget-nested-list:toggle`, `detail: { id, expanded }`, bubbles.
- **Commands never emit:** `expand(id)`, `collapse(id)`, `setItems(items)`.
- Getter: `expandedIds: string[]` — safe empty before setup.
- Readiness: items are rich data, so the widget is not ready until `setup()`; before that it renders nothing and commands throw (skill §5).

## 5. No content regions

The widget declares no regions and does not import `harvestRegions`. All consumer content is per-item and repeated, which is explicitly not a region's job (skill §7 scope) — it goes entirely through `renderLeaf`/`renderGroup`.

Consequence, per skill §7.1: since there's no outlet to route stray markup to, the widget must say so in dev. At connect, before writing the skeleton, `console.error` if the host has non-whitespace children — otherwise that markup would be silently destroyed with no diagnostic, which is the fate the guard exists to avoid.

An empty `items` array renders an empty `<ul class="…children">` and nothing else — no built-in empty-state message. If a consumer wants one, that's presentation around the widget, not inside it; revisit only if a real consumer asks for it.

## 6. Tests

The general list in `docs/testing.md` §7 applies (readiness, setup-twice, HTML and programmatic instantiation, move). Specific to this widget:

- A toggle click emits once with `detail: { id, expanded }`; `expand()`/`collapse()` do not emit.
- Collapsed group: `aria-expanded="false"` and children `<ul>` `hidden`; expanding restores both.
- `aria-controls` matches the children id; ids stay unique across two mounted instances.
- A callback Node lands in the item's extras; a string enters as text; `null` leaves the outlet empty.
- A click on an extras control does not toggle and is not re-dispatched (one handler call, not two).
- Duplicate item ids produce the dev error.
- Non-whitespace children in markup produce the dev error (no content regions); whitespace-only children do not.
- Three levels of nesting render and toggle independently.
- `setItems` is surgical: an unchanged item keeps the same DOM node reference before and after (assert via identity, not just visual state); a changed item's node is reused, not recreated; a removed id's node is removed and disappears from `expandedIds`; an added id gets a new node following the `expanded` seed mode; reordering a `children` array reorders existing nodes rather than recreating them.
- Expansion survives `setItems` for surviving ids.

## 7. Tasks

1. Types + folder anatomy + `setup()` gate + skeleton for a flat list of leaves.
2. Groups: recursion, expansion set, disclosure button, toggle event, commands.
3. Callbacks + extras outlets + the no-consumer-children dev guard.
4. Surgical `setItems`: keyed diff, node reuse, reordering.
5. ARIA pass, accessibility checklist walked (accessibility §10), manual screen-reader pass (§11), full test list green.