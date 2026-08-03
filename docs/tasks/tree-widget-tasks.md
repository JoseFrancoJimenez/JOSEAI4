# Accessible tree widget — `<tree-view>` / `<tree-node>` — task breakdown

## Context

We're rebuilding `src/lib/widgets/toc/` from scratch as a **generic, fully accessible tree**, in a **new folder `src/lib/widgets/tree/`** — the existing `toc/` files are **left untouched** so the two coexist and the old one can be retired later. The rebuild drops the model-driven design in favour of **the DOM as the single source of truth** (no model, no id registry), keeps the **consumer `renderNode` injection** the user values, and adds **real WAI-ARIA APG *Tree View* semantics** + roving-tabindex keyboard operation. It must scale from a few nodes to very large trees.

This file is a **task breakdown**: each task below is a self-contained, committable increment a fresh session can complete in one sitting, with its own tests. The **Design decisions**, **Shapes / API**, and **Keyboard** sections are shared context every task depends on — they are settled and must not be re-litigated. Execute tasks **in order, one per session or per instruction, committing between each**.

Project rules apply throughout (`CLAUDE.md`, `docs/plan.md`): vanilla Web Components, **light DOM**, props-down/events-up, own CSS file with **nested CSS**, self-contained (no imports from `toc/` or elsewhere), strict TS with `#`-private fields, tests co-located as `*.test.ts`.

## Design decisions (settled — do not re-litigate)

- **DOM is the source of truth.** No mutable model, no id→element index. The `<tree-node>` elements *are* the tree (what exists); `expand`/`collapse` are node methods, not id-keyed calls. The one retained structural description — `tree-view`'s `parentId → childDefs` map — is *immutable build input* (see below), not a competing source of truth. (Honours `plan.md` §2: no Model until real domain logic forces one — there is none once the tree lives in the DOM.)
- **All updates are surgical — no full re-render, ever.** `build()` is the *only* bulk construction (the initial build, the role the old `render()` had). Every later change edits only affected nodes: `add` appends one element, `remove` detaches one subtree, `move` **re-parents the actual element** (never rebuilds — structural nesting fixes indentation), `expand` attaches a group, `collapse` detaches it. ARIA stamping is **region-scoped**, never a full-tree walk. Hard invariant, test-enforced.
- **`tree-view` owns lazy building; `<tree-node>` is dumb.** `tree-view` retains the flat `defs` (as a `parentId → childDefs` map) + `renderNode` — the immutable *build recipe*, consulted once per node, never mutated (not a "model": no drift, no single-writer/clone concerns; the DOM stays the source of truth for what *exists*). On a node's **first expand** — detected via the bubbling `tree-node:toggle` with the node's group still empty — `tree-view` builds that node's **direct children only** into its group. **One level per expand, no recursion, no closures**; deeper levels build as the user drills in. Child-building is **synchronous** in the toggle handler (so `expandAll`/keyboard see the children immediately); only ARIA positional stamping is async (observer). The node itself holds **no** build knowledge — it just reflects (`setLeaf`), attaches/detaches its group (`expand`/`collapse`), holds children it's handed (`appendChildNode`), and emits `toggle`.
- **Retain (not destroy/rebuild).** Collapse **detaches** the child group but the node **keeps the element references**; re-expand **re-attaches the same elements** (group non-empty → `tree-view` skips re-building). Nothing is ever rebuilt — stricter than the old lazy build (which destroyed + rebuilt from the model). This is why expansion state is a plain boolean on the node: nothing is destroyed, so nothing must "outlive" a node.
- **Branch vs leaf is set by the container.** `tree-view` calls `node.setLeaf(hasChildrenInMap ? false : true)` at creation (and again after `add`/`remove` change it). A branch shows the toggle + `aria-expanded`; a leaf hides the toggle. The node never infers this — the container, which knows the structure, owns it.
- **Container `<tree-view>` (`role="tree"`), rows `<tree-node>` (`role="treeitem"`), child groups `role="group"`.** Root is a *separate container*, never a synthetic node — every `<tree-node>` is real consumer content. No `<ul>`/`<li>`; roles carry the semantics.
- **The toggle is a pure visual/mouse affordance:** `aria-hidden`, `tabindex=-1`, `visibility:hidden` on a leaf (keeps alignment). Expand state lives in `aria-expanded` on the treeitem itself. The treeitem row is the single focusable/tab unit.
- **Accessible name scoped to the row** via `aria-labelledby` → the content wrapper's id, so a treeitem's name is its own content, not its descendants' concatenation.
- **ARIA positional attrs (`aria-level`/`aria-setsize`/`aria-posinset`) are kept correct by one `MutationObserver`** on `<tree-view>` (`childList`, `subtree`), stamping **only mutated regions** and **batching** bursts (critical: `aria-setsize` is shared across a sibling group, so naive per-mutation stamping is O(n²); batching makes it O(n)). Async (microtask) timing is irrelevant to screen readers and only needs a tick-flush in tests. This same observer maintains the roving invariant on external mutation (below).
- **Roving tabindex:** exactly one rendered `<tree-node>` has `tabindex=0`, rest `-1`. The observer self-heals it (assigns to the first node if none; reassigns to a rendered fallback if the active node is detached). A delegated `focusin` syncs it to mouse clicks; the keyboard handler moves it synchronously (focus can't be async).
- **Keyboard next/prev uses O(depth) DOM tree-order traversal** (first-child → next-sibling → ascend), never an O(n) full-tree scan per keystroke.
- **Structural mutation via explicit element-based methods** on `<tree-view>` — `add(node, parent?, index?)`, `remove(node)`, `move(node, newParent, index?)` — taking element refs, not ids. They handle **leaf↔branch transitions** and **materialize-on-target** (adding/moving *into* a lazy, never-expanded node runs its factory once first so the group is complete; bounded to that node's direct children; adding into a collapsed node does *not* force-expand it). Raw native DOM ops also work (observer catches them); the methods are the correct-by-construction path.
- **Cycle prevention is free:** `move` re-parents via `appendChild`, which throws `HierarchyRequestError` natively when the target is inside the moved subtree. `move` re-wraps it in a clearer error — no manual cycle-walk.
- **One public event:** `tree-node:toggle` (bubbles, `detail: { expanded }`, `target` = the node). Click, Enter/Space, and programmatic toggles all funnel through `node.toggle()`, so it fires uniformly. Consumers persist expansion via `event.target.dataset.id`.
- **`data-id`** is stamped by `build()` on each node and is **load-bearing**: `tree-view` reads `node.dataset.id` on expand to look up that node's `childDefs` in the map. `data-parent-id` is stamped as a courtesy for consumers. `<tree-node>` itself never reads either.
- **Each element's static skeleton comes from an `html()` method returning a string** (matches the existing `toc.ts`/`toc-node.ts` house pattern): the element sets `this.innerHTML = this.html()` once, then grabs element references. Injected content (`renderNode` output, child nodes) is appended into the resulting nodes afterward — it is *not* interpolated into the string (never string-concat consumer content).

## Open decisions

None blocking. Deferred as premature: skipping re-stamp of a *retained* group on re-attach (structure/depth unchanged) — optimize only if profiling shows need.

## Shapes / API (reference for all tasks)

**`<tree-node>` rendered (branch, expanded):**
```html
<tree-node role="treeitem" aria-expanded="true"            ← omitted on a leaf
           aria-level="2" aria-setsize="3" aria-posinset="1"
           aria-labelledby="tn-content-7" tabindex="-1">   ← tabindex 0 on exactly one row
  <div class="tree-node__row">
    <span class="tree-node__toggle" aria-hidden="true"><!-- arrow --></span>
    <div class="tree-node__content" id="tn-content-7"><!-- consumer renderNode output --></div>
  </div>
  <div class="tree-node__group" role="group">              ← only while expanded; built lazily, retained on collapse
    <tree-node role="treeitem" …>…</tree-node>
  </div>
</tree-node>
```
- `createTreeNode(content: HTMLElement): TreeNodeElement`
- `TreeNodeElement`: `get expanded` · `get isLeaf` · `get childCount` · `setLeaf(isLeaf)` · `appendChildNode(child)` · `expand()` · `collapse()` · `toggle()`; emits `tree-node:toggle`. **Dumb** — no build knowledge; the container decides leaf/branch and supplies children.

**`<tree-view>` rendered:**
```html
<tree-view role="tree" aria-label="Tree">   ← forwards consumer aria-label/labelledby, else default "Tree"
  <tree-node role="treeitem" aria-level="1" …>…</tree-node>
</tree-view>
```
- `build<T extends { id: string; parent_id: string | null }>(defs: T[], renderNode: (def: T) => HTMLElement)`
- `add(node, parent?, index?)` · `remove(node)` · `move(node, newParent, index?)` · `expandAll()` · `collapseAll()`

**Usage — the common path is `build()` with a flat array; `tree-view` retains it and builds each node's direct children lazily on first expand:**
```ts
treeView.build(
  [ { id: 'Layers', parent_id: null }, { id: 'Roads', parent_id: 'Layers' }, { id: 'Highways', parent_id: 'Roads' } ],
  (def) => label(def.id),   // consumer supplies each row's content
);
// Internals: build() creates only the ROOT nodes now, marks each setLeaf(!hasKidsInMap), and stores a
// parentId→childDefs map. On `tree-node:toggle` (expanded, group empty), tree-view builds that node's
// DIRECT children from the map into its group — one level per expand, no recursion.

// Manual composition (no defs) is EAGER — you build and wire the elements yourself:
const roads = createTreeNode(label('Roads'));
const layers = createTreeNode(label('Layers'));
layers.appendChildNode(roads);
layers.setLeaf(false);       // mark it a branch
treeView.append(layers);     // a root
```

## Keyboard (Task 3 — owned by `<tree-view>`, one delegated `keydown`, resolving `target.closest('tree-node')`)

- **Down / Up** — roving focus to next / previous rendered row in tree order (O(depth)), clamped (no wraparound).
- **Home / End** — first / last rendered row.
- **Right** — leaf: no-op. Collapsed branch: expand (focus stays). Expanded branch: focus first child.
- **Left** — expanded branch: collapse (focus stays). Else: focus parent (no-op at a root).
- **Enter / Space** — `row.toggle()` (leaf no-op); `preventDefault()`.
- **Ignored** when focus is inside consumer *interactive* content (`interactiveSelector`) so injected inputs keep their key handling — acted on when focus is on the row itself.

---

## Subtasks

### Task 1 — dumb `<tree-node>` element + shared foundation ✅ DONE
**Depends on:** nothing.
**Files:** create `src/lib/widgets/tree/tree-dom.ts`, `tree-node.ts`, `tree.css`, `tree-node.test.ts`, `index.ts`.
**Goal:** a self-contained, accessible, **dumb** row element — reflects state and holds children it's handed, but owns no build knowledge.
**Do:**
- `tree-dom.ts`: CSS class-name constants (`tree-view`, `tree-node__row`, `__toggle`, `__content`, `__group`, expanded/leaf modifiers), `interactiveSelector` (input/button/select/textarea/a[href]/label associations — defined locally, no import from `toc/`), and a monotonic counter for content-wrapper ids.
- `tree-node.ts`: `TreeNodeElement extends HTMLElement` (`role="treeitem"`, `tabindex=-1` baseline) + `createTreeNode(content)`. Row skeleton from an `html()` method returning the string (`.tree-node__row` > `.tree-node__toggle` + `.tree-node__content`); set `this.innerHTML = this.html()`, put `content` into `.tree-node__content` with a unique id, set `aria-labelledby` to it. Toggle is an `aria-hidden` element. **Dumb** methods: `setLeaf(isLeaf)` (host `.is-leaf` class + `aria-expanded` presence — the container decides); `appendChildNode(child)` (append into a lazily-created `role="group"` `.tree-node__group`, not attached until expanded); `expand()` (attach the group, `aria-expanded="true"`, emit `toggle`); `collapse()` (detach — but **retain** — the group, `aria-expanded="false"`, emit `toggle`); `toggle()` funnels both; getters `expanded`/`isLeaf`/`childCount`. Click on toggle (and on content, unless the click hit an `interactiveSelector` element) calls `toggle()`. **No factory, no `#materialize`, no build knowledge** — children are handed in by the container.
- `tree.css`: node styles (row flex, toggle arrow + rotation on expanded, leaf `visibility:hidden`, content, nested-group indent guide) with **nested CSS**, using own-row `>` scoping so a parent's state never restyles descendant rows. Adapt the visual language from `toc.css`.
- `index.ts`: export `TreeNodeElement`, `createTreeNode`, and public types.
**Tests (`tree-node.test.ts`):** uniform row for leaf & branch; content placed + `aria-labelledby` wired + unique ids across nodes; `setLeaf` — leaf hides toggle & drops `aria-expanded`, branch shows toggle & `aria-expanded="false"`, branch→leaf→branch keeps `aria-expanded` reflecting current state; `expand()` attaches the group (`role="group"`, `aria-expanded="true"`); `collapse()` detaches but **retains** (same child instances on re-expand; a typed injected `<input>` keeps value+caret across a cycle); `toggle()`/click/content-click all emit `tree-node:toggle` with `{expanded}`; leaf/interactive-control clicks do **not** toggle; baseline `tabindex=-1`.
**Done when:** `pnpm vitest run src/lib/widgets/tree` green, `pnpm typecheck` adds no new errors, `pnpm lint` clean. **(Met: 14/14 tests pass; no new type errors; eslint clean.)**

### Task 2 — `<tree-view>` container + `build()` + ARIA/roving observer ✅ DONE
**Depends on:** Task 1.
**Files:** create `tree-view.ts`, `tree-view.test.ts`; extend `tree.css` (tree + group + focus-ring vars), `index.ts` (export `TreeViewElement`).
**Goal:** compose nodes into a labeled `role="tree"` from a flat array, with correct positional ARIA and a self-healing single tab stop — a statically complete, screen-reader-correct tree (no keyboard yet).
**Do:**
- `TreeViewElement extends HTMLElement`: `connectedCallback` sets `role="tree"`, applies the accessible name (forward own `aria-label`/`aria-labelledby`, else default `"Tree"`), starts the `MutationObserver`. `disconnectedCallback` disconnects it. Holds `#childrenByParent: Map<string, T[]>` + `#renderNode` (the retained build recipe).
- `build(defs, renderNode)`: clear; store `#renderNode`; build `#childrenByParent` by grouping `defs` on `parent_id`. Create **only the root** `<tree-node>`s (`parent_id === null`) via `createTreeNode(renderNode(def))`; stamp `data-id`/`data-parent-id`; `node.setLeaf(!#childrenByParent.has(def.id))`; append roots. Generic over `T`.
- **Lazy fill (the core of this design):** listen (delegated) for `tree-node:toggle`. On `expanded === true` with the node's `childCount === 0`, look up `#childrenByParent.get(node.dataset.id)` and, for each child def, create a node (`createTreeNode` + `data-*` + `setLeaf` from the map) and `node.appendChildNode(childNode)`. **Synchronous** (so `expandAll`/keyboard see children immediately), **one level per expand** (grandchildren build when the child is itself expanded). Group non-empty (a re-expand after collapse) → skip, so retained children are never rebuilt.
- MutationObserver (`childList`, `subtree`): on mutations, **region-scoped + batched** — re-stamp `aria-level` (from nesting depth), `aria-setsize`/`aria-posinset` (from sibling group) for added nodes and the affected sibling groups; and maintain the roving invariant (ensure exactly one rendered node has `tabindex=0`; if the active one was removed, reassign to a rendered fallback).
- `expandAll()` / `collapseAll()`: `expandAll` repeatedly expands rendered branches until none remain collapsed (since expanding builds the next level synchronously); `collapseAll` collapses all rendered branches.
**Tests (`tree-view.test.ts`, add a `sampleDefs()` + `mount()` helper):** `build()` renders only roots (deep nodes absent until expand); expanding a branch lazily builds its **direct** children (grandchildren still absent) from the map; re-expand after collapse reuses the **same** child instances (not rebuilt); `data-id`/`data-parent-id` stamped, `renderNode` output in content wrapper; `role="tree"` + accessible name (default and forwarded `aria-label`); `role="group"` on child groups; `role="treeitem"` on nodes; `aria-level`/`aria-setsize`/`aria-posinset` correct after a tick, at every level; exactly one `tabindex=0` after build; removing the active node via raw `node.remove()` reassigns the tab stop (after a tick); `expandAll` materializes the whole tree, `collapseAll` collapses it. Flush a microtask before observer-dependent assertions.
**Done when:** suite green, typecheck no new errors, lint clean. **(Met.)**

### Task 3 — keyboard navigation + focus-driven roving ✅ DONE
**Depends on:** Task 2.
**Files:** extend `tree-view.ts`, `tree.css` (`tree-node:focus-visible`), `tree-view.test.ts`.
**Goal:** full keyboard operability on top of the roving invariant.
**Do:**
- Delegated `keydown` on `<tree-view>` resolving `target.closest('tree-node')`, implementing the **Keyboard** section: Up/Down (O(depth) tree-order successor/predecessor, clamped), Home/End, Right (expand-or-descend), Left (collapse-or-ascend), Enter/Space (`toggle()` + `preventDefault`). Ignore when focus is inside `interactiveSelector` content.
- Delegated `focusin`: set the roving tab stop to the focused row (bookkeeping, no `.focus()` call).
- Keyboard moves set `tabindex` synchronously and call `.focus()` on the new row.
- `tree-node:focus-visible` outline using the existing focus-ring CSS var.
**Tests:** Down/Up move among rendered rows in document order, clamped at both ends; Home/End jump to first/last; Right expands a collapsed branch then (when expanded) descends to first child, no-op on leaf; Left collapses an expanded branch then ascends to parent, no-op at a root; Enter/Space toggle a branch and no-op on a leaf; keys ignored (no move/toggle) when focus is in injected interactive content; clicking a row's content/toggle moves the roving stop to it (focusin) and the click still toggles; exactly one `tabindex=0` holds after every keyboard op.
**Done when:** suite green, typecheck no new errors, lint clean. **(Met: 46/46 tests pass; no new type errors; eslint clean.)**

### Task 4 — `add` / `remove` / `move` operations
**Depends on:** Task 2 (independent of Task 3).
**Files:** extend `tree-view.ts`, `tree-view.test.ts`.
**Goal:** programmatic structural mutation with correct leaf/branch, ARIA, and roving outcomes.
**Do:**
- **Materialize-on-target helper:** if the target parent is a branch not yet expanded once (has a `#childrenByParent` entry but `childCount === 0`), build its direct children from the map first (same fill path as expand, minus attaching/expanding) so the group is complete before the new/moved node joins it.
- `add(node, parent?, index?)`: materialize `parent`; insert `node` at `index` (append if omitted); `parent.setLeaf(false)` if it was a leaf; root when `parent` null/omitted (append to `<tree-view>`). Adding into a collapsed node does **not** expand it.
- `remove(node)`: detach `node` + subtree; `parent.setLeaf(true)` if emptied. (Roving repair + ARIA re-stamp come from the observer.)
- `move(node, newParent, index?)`: materialize `newParent`; re-parent via `appendChild`/`insertBefore` (root when null); old parent may become a leaf, new parent a branch (`setLeaf` both). Catch native `HierarchyRequestError` and re-throw a clear "cannot move a node into its own subtree" error, leaving the DOM unchanged.
**Tests:** `add` first child flips leaf→branch (toggle appears, `aria-expanded="false"`); `remove` last child flips branch→leaf; `add`/`move` into a collapsed node materializes but doesn't expand, node appears on next expand; `move` into an expanded node shows it immediately with corrected `aria-level`/`aria-posinset` (incl. a moved *subtree*'s descendants re-levelling, after a tick); cycle-forming `move` throws and leaves the DOM unchanged; root-level `add`/`move` (null parent); `remove` of the active node reassigns the roving stop (after a tick); **surgical**: unaffected nodes remain the *same instances* across `add`/`remove`/`move`.
**Done when:** suite green, typecheck no new errors, lint clean.

## Verification (every task)

- `pnpm vitest run src/lib/widgets/tree` — all tests (that task's + prior) pass. Flush a microtask before assertions that depend on the `MutationObserver`.
- `pnpm typecheck` — no **new** errors (baseline has pre-existing unrelated failures in `src/lib/maps/**`; confirm the diff adds none).
- `pnpm lint` on the new files.
- No dev-server/demo is wired to this widget in-repo, so the jsdom vitest suite (real `KeyboardEvent`s, `focus()`, `MutationObserver`, ARIA assertions) is the behavioural verification surface.

## Out of scope — do NOT

- **No mutable model, no id→element index, no global store.** The DOM is the source of truth for what exists. `tree-view`'s retained `parentId → childDefs` map is *immutable build input* (consulted once per node to lazily materialize, never mutated, never a competing source of truth) — not the `TocModel`-style model we dropped. Do not add element lookup indexes, change-notification, or single-writer machinery around it.
- **No selection model** (`aria-selected`/multiselect), **no typeahead**, **no keyboard reordering** — each is additive later without disturbing this design.
- **No virtualization.** A wide *sibling* set expands fully; lazy building only spares *collapsed* subtrees. Wide-set virtualization, if ever needed, is a separate effort.
- **Do not modify the existing `toc/` files, and do not import from them** — this widget is parallel and self-contained.
- **Do not full-re-render** or scan O(n) per keystroke — keep stamping region-scoped/batched and navigation O(depth).
