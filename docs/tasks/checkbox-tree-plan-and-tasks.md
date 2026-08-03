# Checkbox tree — `<checkbox-tree>` / `<tree-node>` — build plan

## Context & scope

Build a purpose-built, fully accessible **checkbox tree** as a new self-contained widget in `src/lib/widgets/checkbox-tree/`. It renders a hierarchy of rows, each a checkbox + label, with expand/collapse, real WAI-ARIA APG Tree View semantics, and roving-tabindex keyboard operation. Nested groups are supported to any depth.

The input is a **flat array of defs** (`{ id, parent_id, expanded? = false }`) plus a **label function** `getLabel(def) => string`. The tree owns the checkbox — it draws the disclosure twisty *and* the checkbox; the consumer supplies only the label. The tree owns its checked state too (**uncontrolled**), backed by a small pure model, and exposes commands + a change event so any consumer can drive or observe it **without a store** and without adopting any particular state-management pattern.

**Structure changes at runtime**, so the widget provides structural mutation — `add` / `removeNode` / `move` — as first-class operations. **Trees stay small (≤ ~100 nodes)**, which fixes several design choices below: build is eager, there is no lazy building, no virtualization, and no `MutationObserver`; everything is synchronous, and O(n) (occasionally O(n²)) passes are perfectly fine at this size.

This is deliberately a **single-purpose widget**, not a generic base with a checkbox layer bolted on. The reason is technical: the accessible checkbox pattern forces the tree to own the checkbox (state on the row as `aria-checked`, a visual box that is `aria-hidden`, Space toggling it), so there is no meaningful "checkbox-agnostic" seam to abstract for one consumer. Building it directly is simpler and correct. The generic tree machinery is nonetheless kept in clearly delineated, checkbox-free methods so that *if* a second use case ever appears, extracting a base is a move-to-superclass refactor, not a rewrite (see **Reuse boundary**).

This file is a task breakdown. Each task is a self-contained, committable increment a fresh session can finish in one sitting, with its own co-located tests. The **Design decisions**, **Accessibility model**, **State ownership**, **Shapes / API**, and **Keyboard** sections are shared context every task depends on — they are settled and must not be re-litigated. Execute tasks in order, committing between each.

## Project rules (apply throughout)

Vanilla Web Components, **light DOM (no Shadow DOM)**, props-down / events-up, an own CSS file with nested CSS, strict TypeScript with `#`-private fields, tests co-located as `*.test.ts`. The widget is **self-contained**: no imports from sibling widgets, **no app/global state, and it never imports or references a store**. Wiring to app state happens *around* the widget (see **Wiring to app state**), never inside it. Build the minimum that works; add abstraction only when a concrete need forces it.

## Accessibility model (the crux — read before Task 1)

**The container owns the entire keyboard model. The row is the single focusable unit.** This is the one non-negotiable principle; everything else follows from it.

Why it matters: an earlier attempt let the browser's natural tab order reach interactive content inside rows, creating two competing focus models — the tree's roving tabindex and the injected controls' own tab stops — so that content was only reachable by Tab, and Tab jumped clear of the tree. A composite widget's accessibility *is* its keyboard model, and that can't be delegated to opaque focusable DOM inside the rows. The checkbox tree sidesteps this entirely: the checkbox is **not** a real focusable `<input>`.

Concretely:

- **Roving tabindex.** Exactly one rendered `<tree-node>` has `tabindex="0"`; every other has `tabindex="-1"`. The whole tree is a single Tab stop. Arrow keys move focus between rows.
- **The checkbox is state on the row, not a control in it.** Checked state lives in `aria-checked="true | false | mixed"` on the treeitem. The visible box is an `aria-hidden` `<span>` styled from a `data-state` attribute — decorative only, never a focus target. Space toggles it. There is therefore no second focusable element per row, so nothing competes with the roving model. This is the direct fix for the original bug.
- **The disclosure toggle is likewise a pure visual/mouse affordance** — `aria-hidden="true"`, never a focus target, `visibility:hidden` on a leaf (keeps indentation aligned). Expand state lives in `aria-expanded` on the row.
- **Accessible name is scoped to the row** via `aria-labelledby` → the id of the row's content wrapper (which holds the label text), so a treeitem's name is its own label, not a concatenation of its descendants'.
- **Checked ≠ selected.** We use `aria-checked`; do **not** also set `aria-selected` or `aria-multiselectable`. Conflating the two produces confusing screen-reader output.
- **`interactiveSelector` guard (defensive).** The keyboard handler ignores tree keys when focus is inside a match for `interactiveSelector`. With plain-text labels there is no such content, so this is normally moot — it is cheap insurance kept in the generic machinery so the design survives a label that later contains, say, a link.

## State ownership (settled)

**Uncontrolled, backed by a small pure model. Structure lives only in the DOM.** The widget owns its checked state; consumers drive it with commands and observe it with an event. This is what makes the widget usable by any consumer with no store and no particular pattern — nothing is required on the other end.

- **The model holds checked state, not structure.** DOM-as-truth handles *structure* (depth = nesting, existence = the elements, cycles = `appendChild` throwing). The model is a small selection model: a `Set<leafId>` plus the tri-state aggregation rule. It stores **no** structure. This is not incidental — it is the direct consequence of structure changing at runtime. A parallel structural representation held in the model would have to be re-synced to the DOM on every `add` / `removeNode` / `move`, and that dual source of truth is exactly the drift DOM-as-truth exists to prevent. So: the DOM holds structure; the model holds checked state; the widget bridges them by **walking the DOM from the element it already has** (child group down, `parentElement` up — never an `id → element` registry) and asking the model to aggregate.
- **The rule-based part is pure and unit-tested; enumeration is DOM traversal.** "Aggregate a set of leaf states to checked / unchecked / mixed" and the cascade convention ("toggling a group that isn't fully checked checks all of it; a fully-checked group unchecks all — i.e. `mixed` → `checked`") are pure functions over leaf ids and the set — the big DOM-free testing win. Finding *which* leaves are under a node, and which nodes are ancestors, is DOM traversal in the widget, covered by integration tests.
- **Leaves are authoritative; group state is always derived.** The model stores only checked *leaf* ids. A group's state is (DOM-enumerate its descendant leaves) + (`model.aggregate(...)`), computed on demand — never stored, so it can't drift. Because build is eager, a collapsed group's descendants are still in the DOM (just `display:none`), so enumeration is correct regardless of expand state.
- **Emit only on a user gesture.** A click or Space emits `checkbox-tree:change`. The `setChecked(...)` command updates the model and reflects to rows but **does not emit** — its caller already knows. This is the invariant that makes any external wiring loop-safe: **reflecting state must not emit; only user interaction emits.**
- **Controlled mode is explicitly deferred.** A reflected `checkedIds` property (widget holds no state, owner passes it in) is a valid future addition *if* a concrete consumer ever needs strict single-source-of-truth. Per the no-speculation rule, not before. Uncontrolled + model is strictly more self-contained, so it is the right default.

## Optional tri-state (settled)

One build option, `checkable: 'all' | 'leaves'` (default `'all'`), gates three things **together** — not with CSS. (Hiding a group checkbox with CSS only hides pixels: if the row still carries `aria-checked` and Space still toggles it, screen-reader users hear a checkbox sighted users can't see. The switch must gate rendering, ARIA, and behaviour as a unit.)

- **`'all'` (tri-state):** every row gets a checkbox; group `aria-checked` is derived (checked / unchecked / **mixed**); toggling a group cascades to all descendant leaves, toggling a leaf recomputes its ancestors; Space/click toggles checked.
- **`'leaves'`:** only leaf rows get a checkbox and `aria-checked`; group rows get **neither** (no box rendered, no `aria-checked`), and Space/click on a group falls through to expand/collapse. No propagation.

The mode lives in the container, not the model — the model always aggregates correctly; the mode only controls whether group checkboxes are *rendered* and whether the primary action on a group toggles-checked or expands. "Optional" therefore costs one flag, not a second code path. (Note the runtime-mutation interaction: in `'leaves'` mode a leaf↔branch transition changes checkbox presence — see Task 5.)

## Design decisions (settled — do not re-litigate)

1. **DOM is the sole source of truth for structure — at build and after every runtime mutation.** No structural model, no `id → element` registry, no global store. The `<tree-node>` elements *are* the tree. The `parent_id → childDefs` grouping is a **transient local inside `build()`** used to construct the initial tree from the flat array; it is not retained and is not a model. What *is* retained is immutable config (`getLabel`, `checkable`) and checked state (the model) — never a structural mirror.
2. **Checked state lives in the small pure model** (see State ownership). The DOM's `aria-checked` is a *reflection* of the model; the model is authoritative for checked. Structure enumeration for aggregation is DOM traversal in the widget, using element refs it already holds.
3. **Light DOM, no Shadow DOM.** Keeps styling and the `aria-labelledby` wiring straightforward and matches the rest of the library.
4. **Eager build; no lazy building, no virtualization, no `MutationObserver`.** `build()` materializes every node up front. Collapsed subtrees are hidden by CSS (`tree-node[aria-expanded="false"] > .tree-node__group { display:none }`), leaving the accessibility tree and layout while staying in the DOM. At ≤100 nodes this is the simplest correct approach, and everything stays synchronous.
5. **All updates after build are surgical — no full re-render, ever.** `build()` is the only bulk construction. Expand toggles one row's `aria-expanded`. A checked toggle reflects only the affected node, its descendants (on a group toggle), and its ancestors. A structural mutation edits only the affected node/subtree and re-stamps only the affected sibling region. Test-enforced.
6. **Roles carry the semantics.** Container `<checkbox-tree>` is `role="tree"`, rows `<tree-node>` are `role="treeitem"`, child groups are `role="group"`. No `<ul>`/`<li>`. The root is a plain container, never a synthetic node.
7. **Branch vs leaf is set by the container.** tree-view calls `node.setLeaf(hasChildren ? false : true)` at creation and again whenever a mutation changes it. A branch shows the toggle + `aria-expanded`; a leaf hides the toggle and drops `aria-expanded`. The node never infers this.
8. **ARIA positional attrs** (`aria-level` / `aria-setsize` / `aria-posinset`) are stamped **synchronously** — during `build()` (level from depth, setsize from sibling count, posinset from index) and re-stamped by each mutation method for the affected sibling group and, on a move, the moved subtree's levels. No observer, no batching (needless at this scale).
9. **Roving tabindex is managed synchronously.** `build()` sets one visible root to `tabindex="0"`. A delegated `keydown` moves it (focus can't be async); a delegated `focusin` syncs it to mouse clicks; each mutation method repairs it if it detaches the tab-holding node (reassign to a valid visible node; move focus too only if that node was focused).
10. **Navigation is attribute-driven and O(depth).** "Visible" means *no collapsed (`aria-expanded="false"`) ancestor group* — determined from attributes, not computed layout (robust in jsdom). Next/prev uses visible-tree-order traversal (expanded branch → first child; else next sibling; else ascend to next uncle), never an O(n) full scan per keystroke.
11. **All interaction is delegated at the container.** `<tree-node>` has no event listeners — it is a pure view with methods. tree-view delegates `keydown`, `click`, and `focusin`, resolving `target.closest('tree-node')`. tree-view owns interaction because it owns the model, roving, and navigation.
12. **Structural mutation is element-based for existing nodes, def-based for new data.** `removeNode`/`move` take the node (or its id); `add` takes a def (so the widget builds the node — label + checkbox + `data-id` — keeping it consistent). A string id is resolved by a one-off scoped `querySelector('[data-id="…"]')` (with `CSS.escape`) — acceptable at ≤100 nodes and **not** a maintained registry. All id→element resolution goes through a single private #resolve(nodeOrId); no other method may call querySelector for a node. This is the only lookup site, and it is deliberately self-correcting — it either returns a live element or null, so it cannot hand back a detached node. If id lookups ever become frequent or bulk, replace its body with a derived cache: one #index map built lazily by a single querySelectorAll pass and invalidated wholesale (#index = null) by build/add/removeNode/move. Never maintain the map incrementally alongside DOM edits. Cycle prevention is free: re-parenting via `appendChild`/`insertBefore` throws `HierarchyRequestError` when the target is inside the moved subtree; `move` catches it and re-throws a clearer error, DOM unchanged.
13. **Two public events.** `tree-node:toggle` (emitted by a node on expand/collapse; bubbles; `detail: { expanded }`) lets consumers persist expansion via `event.target.dataset.id`. `checkbox-tree:change` (emitted by the container on a checked user gesture; bubbles; `detail: { checkedLeafIds, nodeId, checked }`).
14. **`data-id` is stamped by `build()`/`add()` and is load-bearing** — the widget reads `node.dataset.id` to query the model; it always has the element in hand (from the event target, a traversal, or the caller), so no `id → element` lookup is needed on the hot paths. `data-parent-id` is stamped as a courtesy for consumers.
15. **Static skeletons come from an `html()` method** returning a string (house pattern): set `this.innerHTML = this.html()` once, then grab references. Label text and the checkbox span are placed into the resulting nodes afterward — never string-concatenated into the skeleton.

## Shapes / API

`<tree-node>` rendered (branch, expanded, `'all'` mode, group currently mixed):

```html
<tree-node role="treeitem" aria-expanded="true" aria-checked="mixed"     ← aria-checked omitted in 'leaves' mode on a group
           aria-level="2" aria-setsize="3" aria-posinset="1"
           aria-labelledby="tn-content-7" tabindex="-1">                 ← tabindex 0 on exactly one row
  <div class="tree-node__row">
    <span class="tree-node__toggle" aria-hidden="true"><!-- arrow --></span>
    <span class="tree-node__checkbox" aria-hidden="true" data-state="mixed"></span>   ← added by tree-view; omitted in 'leaves' mode on a group
    <div class="tree-node__content" id="tn-content-7">Reports</div>                    ← getLabel(def) as textContent
  </div>
  <div class="tree-node__group" role="group">          ← in the DOM always; display:none via CSS when aria-expanded="false"
    <tree-node role="treeitem" …>…</tree-node>
  </div>
</tree-node>
```

`createTreeNode(label: string): TreeNodeElement` — builds the generic row skeleton and sets the content wrapper's `textContent` to `label` with a unique id + `aria-labelledby`. (A future generic base would accept `string | Node`; keep it `string` for v1.)

`TreeNodeElement` (dumb view, **no checkbox knowledge**): `get expanded` · `get isLeaf` · `get childCount` · `get rowEl` · `get contentEl` · `setLeaf(isLeaf)` · `appendChildNode(child)` · `expand()` · `collapse()` · `toggleExpand()`; emits `tree-node:toggle`. `rowEl`/`contentEl` let tree-view insert and update the checkbox span. No listeners.

`<checkbox-tree>` (`CheckboxTreeElement`):

```html
<checkbox-tree role="tree" aria-label="Tree">   ← forwards consumer aria-label/labelledby, else default "Tree"
  <tree-node role="treeitem" aria-level="1" …>…</tree-node>
</checkbox-tree>
```

- `build<T extends { id: string; parent_id: string | null }>(defs: T[], getLabel: (def: T) => string, options?: { checkable?: 'all' | 'leaves' }): void` — default `checkable: 'all'`, branches start collapsed. Retains `getLabel` + `checkable` for later `add`.
- `getChecked(): string[]` — current checked leaf ids.
- `setChecked(ids: Iterable<string>): void` — replace the checked set, reflect all rows, **no emit**.
- `add(def: T, parent?: TreeNodeElement | string | null, index?: number): void` — build a node from `def` (label + checkbox) and insert it; `parent` omitted/null = root.
- `removeNode(node: TreeNodeElement | string): void`
- `move(node: TreeNodeElement | string, newParent?: TreeNodeElement | string | null, index?: number): void`
- `expandAll(): void` · `collapseAll(): void`

Pure model (its own module, e.g. `tri-state.ts`) — **no DOM, no structure**:

- `new CheckboxModel()` — starts empty.
- `isChecked(leafId): boolean`
- `aggregate(leafIds: Iterable<string>): 'checked' | 'unchecked' | 'mixed'` — all in set → `checked`, none → `unchecked`, else `mixed`. (Empty input → define as `unchecked`.)
- `toggleLeaf(id): { checked: boolean }` — flips `id` in the set; returns the new value.
- `toggleGroup(leafIds: string[]): { checked: boolean }` — target = `aggregate(leafIds) !== 'checked'` (so `mixed`/`unchecked` → check all, `checked` → uncheck all); sets all; returns the value.
- `setChecked(ids: Iterable<string>): void` · `getChecked(): string[]` · `forget(leafIds: Iterable<string>): void` (drop ids from the set, used on node removal / leaf→branch).

Usage — store-free is the baseline; a plain `Set` (or nothing) is a fine owner:

```ts
tree.build(
  [
    { id: 'docs',    parent_id: null, expanded: true },
    { id: 'reports', parent_id: 'docs', expanded: true },
    { id: 'q1',      parent_id: 'reports' },
    { id: 'q2',      parent_id: 'reports' },
  ],
  (def) => def.id,                 // consumer supplies each row's label
  { checkable: 'all' },
);

tree.setChecked(['q1']);                         // drive from anywhere; reflects, does not emit
tree.add({ id: 'q3', parent_id: 'reports' }, 'reports');   // runtime structural change
tree.addEventListener('checkbox-tree:change', (e) => {
  const { checkedLeafIds } = e.detail;           // observe user gestures
});
```

## Keyboard (owned by `<checkbox-tree>`, one delegated `keydown`, resolving `target.closest('tree-node')`)

- **Down / Up** — roving focus to next / previous **visible** row (skipping rows under a collapsed ancestor) in tree order (O(depth)), clamped (no wraparound).
- **Home / End** — first / last visible row.
- **Right** — leaf: no-op. Collapsed branch: expand (focus stays). Expanded branch: focus first child.
- **Left** — expanded branch: collapse (focus stays). Else: focus parent (no-op at a root).
- **Enter / Space** — primary action = **toggle checked** on the focused row; `preventDefault()`. In `'leaves'` mode on a group (no checkbox), fall through to expand/collapse instead.
- **Suppressed** when focus is inside a match for `interactiveSelector` (defensive; see Accessibility model).

Note the deliberate departure from a plain tree: Space toggles the checkbox, not expansion — expand/collapse is Right/Left and the twisty click.

## Wiring to app state (app-level, outside the library)

The library widget never imports a store. Connecting it to one is an app concern, per the architecture doc's §4 pattern, and lives in a wrapper under `src/apps/…`.

```ts
// app wrapper — the ONLY place that knows a store exists
connectedCallback() {
  // Do NOT read the store in a field initializer — construction can precede store population.
  // Construct empty; populate here via the same sync path used for every later update.
  this.#unsub = store.subscribeMany(['checked'], () => {
    this.#tree.setChecked(store.checkedLeafIds);          // store → widget (command, no echo: setChecked doesn't emit)
  }, { immediate: true });                                 // runs once now (data already present) AND on every change

  this.#tree.addEventListener('checkbox-tree:change', (e) => {
    store.setChecked(e.detail.checkedLeafIds);             // widget → store (wrapper is the sole writer)
  });
}
disconnectedCallback() { this.#unsub(); }
```

Loop safety is structural: `setChecked` reflects without emitting, so `store → widget` is a dead end; only a user gesture emits, and the store's `Object.is` guard absorbs a write it already holds. A store-free app skips all of this — it calls `getChecked()` on submit, or listens to `checkbox-tree:change`. An app with no state-management library wires nothing and the widget still works.

## Reuse boundary — the two seams (do not build the base now)

The hard, valuable machinery — roving tabindex, visible-tree-order navigation, ARIA positional stamping, structural mutation, roles, accessible name — is genuinely generic and has nothing to do with checkboxes. Keep it in checkbox-free methods so a future base is a mechanical extraction. Do **not** build abstract hooks, a base class, or a `renderRow` override now — that is the speculative ceremony the architecture doc warns against, and a base with one consumer is exactly when it is premature. Mechanical extraction is guaranteed by two rules that cost nothing because they are just good decomposition:

1. **Checkbox logic lives in named units, never inlined into generic methods:** the pure `CheckboxModel`; the checkbox visual + `aria-checked` added/updated by named methods (`#addCheckbox(node)`, `#reflectState(node)`); the `setChecked`/`getChecked` commands; and the primary action routed to one method, `#togglePrimary(node)`.
2. **Generic methods never mention "checkbox":** structure-building, navigation, ARIA stamping, roving, the `keydown`/`click`/`focusin` dispatch, and the `add`/`removeNode`/`move` structural core talk about rows, groups, and levels only.

Given those, checkbox meets machinery at exactly **two touch-points**, both already single method calls — the override points a base would need:

- **Row construction** — generic code builds `.row > .toggle + .content` and inserts it, then calls `#addCheckbox`. Extract → the skeleton/insert moves to the base; `#addCheckbox`/`#reflectState` stay in the shell.
- **Primary action** — the `keydown`/`click` dispatch is generic (Left/Right do expand/collapse in *any* tree) and routes Enter/Space/checkbox-click to `#togglePrimary`. Extract → the dispatch moves to the base with a default primary action of "toggle expand"; the shell overrides it with "toggle checked + emit".

The one thing that would turn extraction into archaeology: threading checked state through the structural path (a `checked` field on defs, or the `add`/`move` core reading the set). Don't. The mutation *core* changes structure and re-stamps ARIA/roving generically; its *checkbox concerns* (forgetting removed leaves, reflecting affected ancestors, leaf↔branch checkbox presence) are separable calls layered on top.

---

## Tasks

### Task 1 — dumb `<tree-node>` element + shared foundation

**Depends on:** nothing.
**Files:** create `src/lib/widgets/tree/tree-dom.ts`, `tree-node.ts`, `tree.css`, `tree-node.test.ts`, `index.ts`.
**Goal:** a self-contained, accessible, dumb row element — reflects structural state and holds children it is handed. It carries **no** checkbox knowledge and no event listeners (tree-view delegates all interaction).

**Do:**
- `tree-dom.ts`: CSS class-name constants (`tree-view`, `tree-node__row`, `__toggle`, `__checkbox`, `__content`, `__group`, plus leaf/expanded modifiers), `interactiveSelector` (input / button / select / textarea / `a[href]` / label associations — defined locally, no cross-widget import), and a monotonic counter for content-wrapper ids.
- `tree-node.ts`: `TreeNodeElement extends HTMLElement` (`role="treeitem"`, baseline `tabindex="-1"`) + `createTreeNode(label)`. Row skeleton from an `html()` method returning the string (`.tree-node__row > .tree-node__toggle + .tree-node__content` — **no checkbox in the generic skeleton**); set `this.innerHTML = this.html()`, put `label` into `.tree-node__content` as `textContent` with a unique id, set `aria-labelledby` to it. Toggle is an `aria-hidden` element. Methods: `setLeaf(isLeaf)` (leaf modifier class + presence/absence of `aria-expanded`); `appendChildNode(child)` (append into a lazily-created `role="group"` `.tree-node__group`); `expand()` / `collapse()` (set `aria-expanded`, emit `tree-node:toggle`); `toggleExpand()` (funnels both); getters `expanded` / `isLeaf` / `childCount` / `rowEl` / `contentEl`. **No listeners, no checkbox, no build knowledge.**
- `tree.css` (nested CSS): row flex, toggle arrow + rotation when expanded, leaf `visibility:hidden` on the toggle, content, nested-group indent guide, and **CSS collapse**: `tree-node[aria-expanded="false"] > .tree-node__group { display: none; }`. Use own-row `>` scoping so a parent's state never restyles descendant rows.
- `index.ts`: export `TreeNodeElement`, `createTreeNode`, and public types.

**Tests (`tree-node.test.ts`):** uniform row skeleton (no checkbox present); label placed as `textContent` + `aria-labelledby` wired + unique ids across nodes; `setLeaf` — leaf hides the toggle & drops `aria-expanded`, branch shows the toggle & sets `aria-expanded="false"`, branch→leaf→branch keeps `aria-expanded` reflecting current state; `expand()`/`collapse()` set `aria-expanded` and emit `tree-node:toggle` with `{ expanded }`; `toggleExpand()` funnels; `appendChildNode` places children in a `role="group"`; `rowEl`/`contentEl` return the expected elements; baseline `tabindex="-1"`. (Assert on `aria-expanded`/classes, not computed `display` — jsdom does no layout.)

**Done when:** `pnpm vitest run src/lib/widgets/tree` green, `pnpm typecheck` adds no new errors, `pnpm lint` clean.

### Task 2 — pure model (checked set + tri-state aggregation, no DOM)

**Depends on:** nothing (independent of the DOM; can be done in parallel with Task 1).
**Files:** create `tri-state.ts`, `tri-state.test.ts`; extend `index.ts` (export `CheckboxModel` + types).
**Goal:** isolate the only rule-based checkbox logic and unit-test it without a DOM — the big testing win. The model holds checked state and the aggregation/cascade rules; it holds **no structure** (the widget supplies leaf-id lists by walking the DOM).

**Do:**
- `tri-state.ts`: `CheckboxModel` (see Shapes / API). A private `Set<string>` of checked leaf ids. Implement `isChecked`, `aggregate` (all → `checked`, none → `unchecked`, else `mixed`; empty → `unchecked`), `toggleLeaf` (flip; return `{ checked }`), `toggleGroup` (target = `aggregate(leafIds) !== 'checked'`; set all to target; return `{ checked: target }`), `setChecked` (replace the set from the iterable), `getChecked` (array snapshot), `forget` (delete ids).

**Tests (`tri-state.test.ts`):** `aggregate` for all-checked, none-checked, partial (mixed), and empty (→ unchecked); `isChecked`; `toggleLeaf` flips and returns the new value; `toggleGroup` — from unchecked → all checked, from checked → all unchecked, from mixed → all checked (the convention), each returning the right `checked`; `setChecked` replaces the set; `getChecked` returns exactly the set; `forget` drops ids and leaves others. All DOM-free.

**Done when:** suite green, typecheck no new errors, lint clean.

### Task 3 — `<checkbox-tree>` build + ARIA + roving + checkbox rendering (static, no interaction)

**Depends on:** Tasks 1 and 2.
**Files:** create `checkbox-tree.ts`, `checkbox-tree.test.ts`; extend `tree.css` (tree role container, checkbox visual states, focus-ring var), `index.ts` (export the element).
**Goal:** compose a labeled `role="tree"` from the flat defs, with correct positional ARIA, a single tab stop, and checkboxes rendered per mode — statically complete and screen-reader-correct. No keyboard, no toggling yet.

**Do:**
- `CheckboxTreeElement extends HTMLElement`: `connectedCallback` sets `role="tree"`, applies the accessible name (forward own `aria-label`/`aria-labelledby`, else default `"Tree"`). Holds `#getLabel`, `#checkable`, and `#model = new CheckboxModel()`.
- `build(defs, getLabel, { checkable = 'all' } = {})`: clear; store `getLabel` + `checkable`; group defs on `parent_id` into a **transient** `Map` (not retained). **Eagerly** build every node, roots (`parent_id === null`) down, via a recursion that: creates `createTreeNode(getLabel(def))`; stamps `data-id`/`data-parent-id`; `node.setLeaf(!hasChildren)`; stamps `aria-level`/`aria-setsize`/`aria-posinset` **synchronously**; builds and `appendChildNode`s children if a branch; and, when the mode calls for a checkbox on this node (`'all'` → always; `'leaves'` → only leaves), calls `#addCheckbox(node)`. Append roots; branches start collapsed (`aria-expanded="false"`). Set one visible root to `tabindex="0"`. (Model is empty, so all checkboxes render unchecked.)
- `#addCheckbox(node)`: insert an `aria-hidden` `.tree-node__checkbox` `<span>` into `node.rowEl` (after the toggle, before the content); set the node's `aria-checked="false"` and the span's `data-state="unchecked"`. Groups in `'leaves'` mode get **neither** the span nor `aria-checked`.
- `expandAll()` / `collapseAll()`: flip `aria-expanded` on all rendered branches (all already built).

**Tests (`checkbox-tree.test.ts`, add `sampleDefs()` + `mount()` helpers):** `build()` renders the full structure (all levels present); `role="tree"` + accessible name (default and forwarded `aria-label`); `role="group"` on child groups, `role="treeitem"` on nodes; `aria-level`/`aria-setsize`/`aria-posinset` correct at every level (synchronous — **no tick-flush**); label text in the content wrapper, `aria-labelledby` wired, unique ids; `'all'` mode → every node has a checkbox span + `aria-checked="false"`; `'leaves'` mode → only leaves have a checkbox span + `aria-checked`, groups have neither; exactly one `tabindex="0"` after build; branches start collapsed; `expandAll`/`collapseAll` flip `aria-expanded`.

**Done when:** suite green, typecheck no new errors, lint clean.

### Task 4 — interaction: keyboard, click, checkbox toggling, change event, commands

**Depends on:** Task 3.
**Files:** extend `checkbox-tree.ts`, `tree.css` (`tree-node:focus-visible`), `checkbox-tree.test.ts`.
**Goal:** full keyboard + pointer operability and the uncontrolled checked-state contract, with checked state read/written through the model and structure walked in the DOM.

**Do:**
- **DOM-walk helpers** (checkbox-free traversal, reused by Task 5): `#visibleSuccessor(node)`/`#visiblePredecessor(node)` (visible-tree-order, O(depth)); `#enclosingNodes(node)` (`parentElement` chain up to the container, tree-nodes only); `#descendantLeafIds(node)` (leaf `data-id`s under a node, via a scoped walk of its group). And reflection helpers: `#reflectState(node)` — if the node has a checkbox: for a leaf set `aria-checked`/`data-state` from `#model.isChecked(id)`; for a group set them from `#model.aggregate(#descendantLeafIds(node))`; `#reflectSubtree(node)` (node + each descendant) and `#reflectAncestors(node)` (each enclosing node).
- **Delegated `keydown`** resolving `target.closest('tree-node')`, implementing the **Keyboard** section: Up/Down (`#visibleSuccessor`/`Predecessor`, clamped), Home/End, Right (expand-or-descend), Left (collapse-or-ascend), Enter/Space (`#togglePrimary` + `preventDefault`). Ignore when focus is inside an `interactiveSelector` match. Moving focus sets `tabindex` synchronously and calls `.focus()`.
- **Delegated `click`:** toggle or content (not an `interactiveSelector` match, not the checkbox) → `node.toggleExpand()`; checkbox span → `#togglePrimary(node)`.
- **Delegated `focusin`:** set the roving tab stop to the focused row (bookkeeping, no `.focus()` call).
- `#togglePrimary(node)`: in `'leaves'` mode on a group → `node.toggleExpand()` and return. Leaf → `const { checked } = #model.toggleLeaf(node.dataset.id)`. Group → `const { checked } = #model.toggleGroup(#descendantLeafIds(node))`. Then `#reflectSubtree(node)` + `#reflectAncestors(node)`, and dispatch `checkbox-tree:change` with `{ checkedLeafIds: #model.getChecked(), nodeId: node.dataset.id, checked }`.
- `setChecked(ids)`: `#model.setChecked(ids)`; reflect **all** rendered rows (an O(n) pass — bulk by nature, no rebuild); **do not emit**. `getChecked()`: `#model.getChecked()`.
- `tree.css`: `tree-node:focus-visible` outline using the focus-ring var.

**Tests:** Down/Up move among **visible** rows (rows under a collapsed ancestor skipped), clamped; Home/End jump to first/last visible; Right expands a collapsed branch then descends, no-op on a leaf; Left collapses an expanded branch then ascends, no-op at a root; **Enter/Space toggle checked** — a leaf flips `aria-checked` and emits `checkbox-tree:change` with the new `checkedLeafIds`; a group in `'all'` cascades to all descendant leaves and updates its own `aria-checked`; a group in `'leaves'` expands and emits nothing; checkbox click behaves like Space; **tri-state reflection** — checking every child flips the parent to `checked`, unchecking one flips it to `mixed` (assert `aria-checked` + checkbox `data-state` on ancestors); `setChecked` reflects checked/mixed visuals and **does not** emit; `getChecked` returns the current set; **change fires on a user gesture but not on `setChecked`**; keys suppressed when focus is in injected interactive content; exactly one `tabindex="0"` after every op; **surgical** — nodes outside the affected subtree/ancestors are untouched after a toggle. (No tick-flush anywhere.)

**Done when:** suite green, typecheck no new errors, lint clean.

### Task 5 — structural mutation: `add` / `removeNode` / `move`

**Depends on:** Tasks 3 and 4 (uses the reflection + traversal helpers).
**Files:** extend `checkbox-tree.ts`, `checkbox-tree.test.ts`.
**Goal:** runtime structural change with correct structure, ARIA, roving, and checkbox outcomes — all surgical and synchronous, with the DOM as the sole structure source.

**Do:**
- **Resolve + re-stamp helpers:** `#resolve(nodeOrId)` (return the element, or `querySelector('[data-id="' + CSS.escape(id) + '"]')`); `#restampSiblings(group)` (set `aria-setsize`/`aria-posinset`/`aria-level` for the direct children of a group or the root); `#restampLevels(subtree)` (set `aria-level` throughout a moved subtree by depth); `#repairRoving()` (ensure exactly one visible node has `tabindex="0"`; if the tab-holder detached, reassign — and if it was focused, move focus).
- `add(def, parent?, index?)`: `const parentNode = parent == null ? null : #resolve(parent)`. Build the node from `def` (`createTreeNode(#getLabel(def))`, stamp `data-id`/`data-parent-id`, `setLeaf(true)`, `#addCheckbox` if the mode gives a leaf a checkbox — in both modes a new leaf gets one). Insert at `index` (append if omitted) into the parent's group (root → the container). If the parent was a leaf becoming a branch: `parentNode.setLeaf(false)`, and — **`'leaves'` mode only** — remove the parent's checkbox span + `aria-checked` and `#model.forget([parentId])` (a group has no authoritative checked state). Re-stamp the parent's sibling group + the new node's level. Reflect the parent's ancestors (a new unchecked leaf can flip a checked group to mixed). `#repairRoving()`.
- `removeNode(node)`: `node = #resolve(node)`. `#model.forget(#descendantLeafIds(node))`. Detach the node + subtree. If the former parent is now empty: `parent.setLeaf(true)`, and — **`'leaves'` mode only** — add a checkbox to the parent (it is now a leaf). Re-stamp the former parent's sibling group. Reflect the former parent's ancestors (removing an unchecked leaf can flip a mixed group to checked). `#repairRoving()`.
- `move(node, newParent?, index?)`: `node = #resolve(node)`; `const target = newParent == null ? null : #resolve(newParent)`; remember `oldParent`. Re-parent via `appendChild`/`insertBefore` (root → the container), wrapped in try/catch: a native `HierarchyRequestError` (target inside the moved subtree) is re-thrown as a clear "cannot move a node into its own subtree" error, DOM unchanged. The moved node keeps its checked state (its leaves stay in the set). Update leaf/branch on both parents (with the `'leaves'`-mode checkbox add/remove as above). Re-stamp both sibling groups + `#restampLevels(node)` (depth changed). Reflect **both** old and new parents' ancestors. `#repairRoving()`.

**Tests:** `add` a first child flips a leaf→branch (toggle appears, `aria-expanded="false"`), and in `'leaves'` mode the parent loses its checkbox; `add` an unchecked leaf into a fully-checked group flips that group (and its ancestors) to `mixed`; `removeNode` the last child flips branch→leaf (and in `'leaves'` mode the parent gains a checkbox), and removing an unchecked leaf from a `mixed` group can flip it to `checked`; `removeNode` drops the removed leaves from `getChecked`; `move` shows the node under its new parent with corrected `aria-level`/`aria-posinset` (including a moved subtree's descendants re-levelling), keeps its checked leaves, and updates **both** old and new parents' group states; a cycle-forming `move` throws and leaves the DOM unchanged; root-level `add`/`move` (null parent); string-id and element arguments both resolve; `removeNode`/`move` of the tab-holding node reassigns `tabindex="0"`; **surgical** — nodes outside the affected region keep their identity and state. (All synchronous — no tick-flush.)

**Done when:** suite green, typecheck no new errors, lint clean.



### Task 6 — Test app: `add` / `removeNode` / `move`

**Depends on:** All previous tasks.
**files:** `src/apps/toc-demo/src/main.ts`, `src/apps/toc-demo/src/people.ts`
**Goal:** to Add two trees to the toc-demo app.

**Do:**
Add two trees to the toc-demo app. Use the same data for both (people.ts).One tree must use the option `all` the other should do `leaves`.

**Test:**  No test required for this task. 

**Done when:** Both trees have been added to the app and the user confirms they work as intended.

---

## Verification (every task)

- `pnpm vitest run src/lib/widgets/tree` — all tests (that task's + prior) pass. Nothing is async (no `MutationObserver`), so **no microtask flush is required**; assertions are synchronous.
- `pnpm typecheck` — no new errors (confirm the diff adds none over the existing baseline).
- `pnpm lint` on the new files.
- The jsdom vitest suite (real `KeyboardEvent`s, `focus()`, ARIA assertions) is the behavioural verification surface. Automated ARIA checks confirm attribute/role correctness but **cannot** confirm what a screen reader announces; a periodic manual pass with a real screen reader on the keyboard contract is recommended, especially at boundaries (first/last row, leaf vs branch, collapsed vs expanded, checked/unchecked/mixed group announcements in each mode, and after a mutation).

## Out of scope — do NOT

- **No structural model, no `id → element` registry, no global store, and no store import.** Structure is DOM-as-truth (at build and after every mutation); checked state is the small pure model (a `Set` + aggregation rules). String-id arguments are resolved by a one-off scoped `querySelector`, not a maintained map. Do not add an id → element registry maintained across mutations — it is a second source of truth for structure, and the failure mode is silent: a stale entry returns a detached node that still reads as valid (dataset.id intact, methods don't throw) while the visible tree diverges. If lookups become a bottleneck, cache inside #resolve only, invalidated wholesale — see Design decisions §12.
- **No controlled mode** (a reflected `checkedIds` property). Uncontrolled + model is the v1 contract; controlled is an additive future option if a concrete consumer needs strict single-source-of-truth.
- **No lazy building and no virtualization.** Eager build is correct at ≤100 nodes; the model (not the DOM) holds checked state, so lazy building buys nothing for correctness and is not needed at this scale.
- **No selection model** (`aria-selected`/`aria-multiselectable`), **no typeahead**, **no keyboard reordering** — each is additive later without disturbing this design.
- **No dependency on sibling widgets or app state**, no full re-render, and no O(n) per-keystroke scan — keep navigation O(depth) and checked reflection targeted (subtree + ancestors) on a gesture; the only O(n) passes are bulk `setChecked` and mutation re-stamping, both fine at this size.
- **Do not thread checked state through the structural/build path** (no `checked` on defs; the `add`/`move` *core* never reads the set — its checkbox concerns are separable calls layered on top). Keeping the structural core checkbox-free is what keeps the eventual base extraction mechanical.