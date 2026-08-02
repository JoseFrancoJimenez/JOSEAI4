# TOC Widget — Brief (all-surgical redesign)

**For the AI assistant:** this is a **redesign** of the existing `TocComponent` (library widget, `src/lib/widgets/toc/`) — an expandable tree panel. Stack: Vite + TypeScript, **vanilla** Web Components, **light DOM**, no frameworks. Be pragmatic — this widget renders **≤ ~20 nodes**, so optimize for **correctness and simplicity, not raw performance**.

It stays **tier-2 MVVM** (View + a `TocModel`; view-state lives in the widget; **no ViewModel** — correct at this size, see `plan.md` §2). Contract: configured via `setup(model, renderNode)`; communicates out via `CustomEvent` (`clickToggle`, `change`).

**What changes vs. the current component:**
1. **All DOM updates are surgical.** The full re-render (`replaceChildren` of the whole tree) is **removed as a runtime path**. `render()` is used **only** for the initial build; every later change touches the DOM directly.
2. A **per-node custom element `<toc-node>`** owns each row's DOM projection.
3. A **`Record<string, TocNode>` index** gives O(1) access to any node's element.
4. **Uniform row rendering** — every row renders identically; a `--leaf` class hides the toggle when a node has no children (kills the leaf→branch edge case).
5. The **focus/input snapshot-and-restore logic is DELETED** — with no full re-render, unrelated DOM is never destroyed, so focus/caret/scroll/typed-text are preserved **by construction**, not restored.

**What stays:** `TocModel` is unchanged (it already validates cycles, computes depth, resolves `parent_id`); the **lazy child build** (child lists built on expand, removed on collapse); the read-only model injection (Part B).

---

## Ownership — read this first (it's what keeps surgical from breaking)

Three layers, crisp boundaries. Going surgical means the DOM can drift from the model if any layer oversteps — so:

- **`TocModel`** — **domain**. The tree structure, cycle validation, depth. **Sole owner of the tree.** Injected read-only (Part B).
- **`TocComponent`** (`<toc-component>`) — **orchestrator + view-state owner**. Owns `#expanded: Set<string>` (the single source of truth for expansion), the **`Record<id, TocNode>` index**, and the `model` + `renderNode` references. It builds nodes, reacts to model events with surgical DOM edits, runs the lazy build, and emits `clickToggle` / `change`.
- **`<toc-node>`** — **presentation of one row**. Owns **only its own DOM projection**. It reflects state it's told (`setExpanded`, `setLeaf`), owns its subtree's DOM membership (`detach`, its child container), and holds the injected content. It does **NOT** own domain, does **NOT** decide expansion, and does **NOT** touch the model or the index.

**The rule:** a `<toc-node>` method is **DOM-sync, never domain**. `TocModel.move()` *decides and validates*; `tocNode.detach()` *reflects*. If a node method ever mutates the model, the boundary is broken.

**Expansion state lives in the widget, never on the node.** `#expanded` (the widget's `Set`) is the **sole truth** for what's expanded; a `<toc-node>` *reflects* its expanded state (class + ARIA) but does **not** own it. Two reasons, the first decisive:

- **The lazy build destroys collapsed subtrees.** If `expanded` were a boolean on the node, collapsing an ancestor would destroy its descendant nodes and **lose the expansion state of any expanded descendants inside it**. A `Set` in the widget survives that; a boolean on a destroyed element does not. Expansion state must outlive the node.
- **The widget needs it aggregated.** The `change` event emits `[...#expanded]`, and `expandAll`/`collapseAll` and store-hydration *set* it — trivial from the `Set`, but N node-walks (and a second representation to keep in sync) if the truth were spread across nodes. Spreading it re-creates the exact two-sources-of-truth problem we avoid in the store.

---

## 1. `<toc-node>` — the per-row element

- **Config (props-in, by property):** `id`, `hasChildren`, and a **content element** (the consumer's `renderNode(node)` output). Set by the widget.
- **Uniform row:** ALWAYS renders the same structure — a toggle button + a content wrapper. **No branching** between leaf and branch layouts. This is the key to killing the edge case.
- **Leaf handling:** a `--leaf` class hides the toggle with **`visibility: hidden`** (or `opacity` / `pointer-events: none`) — **NOT `display: none`** (the toggle must keep occupying space so rows stay aligned; this is what the old indent spacer did). ARIA: when leaf, the toggle is `aria-hidden="true"` and has **no** `aria-expanded`; `visibility:hidden` also removes it from tab order. `setLeaf(isLeaf)` toggles class + ARIA.
- **Child list (lazy):** the node owns a child-list container (`<ul>`), but the **widget populates it** — the node does not build children from the model itself. Expose the container (or `appendChildNode(node)` / `clearChildren()` helpers) so the widget can add/remove child `<toc-node>`s.
- **Presentation methods:** `setExpanded(bool)` (toggle `is-expanded` class + `aria-expanded`), `setLeaf(bool)`, `detach()` (remove itself + its subtree from the DOM), plus child-container access.
- **Toggle interaction — the node owns the interaction and emits an event; it does NOT flip its own truth.** On a click of its toggle, the `<toc-node>` emits a `toggle` event (`{ id }`) upward. The widget receives it, updates `#expanded` (the truth), calls `node.setExpanded(newValue)` so the node reflects it (and builds/prunes the lazy child list), then emits the public events. So: **the node handles the interaction and announces it; the widget owns the state and tells the node how to reflect.** That is exactly why `setExpanded` is a *reflector*, not a setter of node-owned truth.

`<toc-node>` is an internal building block of the TOC widget, not a public API. It has methods but no state ownership — closer to a dumb presentation element than a widget.

---

## 2. The index — `Record<string, TocNode>`

- Maps **node id → its `<toc-node>` element** (the row element, **NOT** the injected content).
- Replaces the current `querySelectorAll('.toc-node').find(...)` scans with **O(1)** lookups.
- **Owned by the widget.** The node does **not** self-register or self-unregister (no `disconnectedCallback` index bookkeeping — that would create two owners; keep one).
- **Lifecycle — must follow the DOM exactly.** Register a node when the widget **builds** it; unregister when the widget **prunes** it from the DOM (ancestor collapse, `remove`, move-into-collapsed). Because of the lazy build, nodes come and go constantly — a stale index entry means a **memory leak** and lookups returning **dead elements**. Pruning the index must mirror pruning the DOM, subtree-for-subtree.

---

## 3. All-surgical operations (no full re-render)

`render()` is now **initial build only** (called from `connectedCallback` / `setup`): it builds the root `<toc-node>`s (and any expanded subtrees) from the model, once. It is **not** called by any operation below. Every operation edits the DOM via the index:

- **User toggle** — driven by the node's `toggle` event (§1), not central delegation. On receiving it, the widget flips `#expanded` for that id, does the expand/collapse DOM work below (`setExpanded` + lazy build/prune), then emits `clickToggle` then `change`.
- **`expand(id)` / `collapse(id)`** — surgical: on expand, build the child subtree (lazy) into the node's container and register it, then `node.setExpanded(true)`; on collapse, remove the child container's nodes (unregister them + prune from `#expanded`), then `node.setExpanded(false)`. Emit `change`.
- **`expandAll` / `collapseAll`** — iterate the affected ids via the index, doing the per-node build/prune + `setExpanded`. Emit **one** `change`. **No full re-render.**
- **Model event reactions (surgical):**
  - **`add`** — see §4.
  - **`remove`** — `node = index.get(id)`; `node.detach()`; unregister the node **and its whole subtree** from the index and from `#expanded`.
  - **`move`** — see §4.
  - **`clear`** — detach all roots / empty the root container; clear the index and `#expanded`.

---

## 4. `add` and `move`

### `add` (surgical, simple)

- Find the parent's `<toc-node>` via the index. Append a new `<toc-node>` at the end of the parent's child container; register it.
- **Edge 1 — parent not currently rendered** (a collapsed ancestor / lazy): **no DOM op**. The new node appears when the ancestor is next expanded (the lazy build reads it from the model, which is already the source of truth).
- **Edge 2 — parent was a leaf, now a branch:** `parentNode.setLeaf(false)` — the toggle appears and `aria-expanded="false"` is set. Because rows are **uniform**, this is a **class + ARIA flip, not an element swap**. (Do not build the child `<ul>` yet — the node starts collapsed; the list builds lazily on expand.)

### `move` (the complex one — model decides, node reflects)

- **`TocModel.move(id, newParentId)` validates (cycle detection) and mutates the domain tree + recomputes depths.** This is the decision. The widget does **not** re-validate.
- **In reaction**, the widget syncs the DOM:
  - `moved = index.get(id)`; `newParent = index.get(newParentId)` (or the root container).
  - `moved.detach()` — pull the subtree out of the DOM.
  - **If `newParent` is expanded** (its child container is present): append `moved` into it. Indentation is **structural** (nested `<ul>`), so re-parenting the element **fixes indentation automatically** — no per-node depth writes.
  - **If `newParent` is collapsed / not rendered:** drop the moved subtree (unregister it from the index); it rebuilds lazily when `newParent` is next expanded.
  - **Old parent may become a leaf** (lost its last child) → `setLeaf(true)`.
  - **New parent may become a branch** (gained its first child) → `setLeaf(false)`.
- **Depth:** the model recomputes it; the DOM reflects depth via nested-`<ul>` structure, so no explicit depth writes to nodes are required.

This is exactly why `<toc-node>` earns its place: `move` reads as node-to-node DOM operations (`detach`, append) orchestrated by the widget, instead of raw DOM surgery inline.

---

## 5. Events & docs

- **Exactly two *public* events** (emitted by `<toc-component>`): `clickToggle` → `'toc:click:toggle'`, `change` → `'toc:change'`. A user click emits `clickToggle` **then** `change`; the **programmatic** methods (`expand`/`collapse`/`expandAll`/`collapseAll`) emit **only** `change`. `change` carries a snapshot of the expanded ids.
- The `<toc-node>`'s `toggle` event (§1) is **internal** (node → widget) and is **not** part of this public contract — do not surface it to consumers.
- **No stale event names in any docblock.** There is **no** `autoToggle` event — do not reference it anywhere.

---

## Part B — Library integration

### Read-only model injection (single writer by types)

So a consumer sharing the `TocModel` can't mutate the tree by accident — a single-writer guarantee enforced by **types**, not convention.

```typescript
// toc.types.ts
export interface ITocModelReadable {
  readonly roots: readonly ITocNode[];
  get(id: string): ITocNode | undefined;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<ITocNode>;
  on<K extends keyof ITocModelEvents>(event: K, handler: (p: ITocModelEvents[K]) => void): Subscription;
}
export interface ITocModelWritable extends ITocModelReadable {
  add(def: ITocNodeDef): void;
  remove(id: string): void;
  move(id: string, newParentId: string | null): void;
  clear(): void;
}
```

- `TocModel implements ITocModelWritable` — **no code change**, it already has these.
- `setup(model: ITocModelReadable, ...)` — the widget receives the **read-only** interface, so it cannot call `add`/`remove`/`move`/`clear`; the compiler enforces it. Only whoever holds the concrete `TocModel` can write. Do this and nothing more (no runtime guards, no model wrappers).

### App-level wrapper (example — an app under `src/apps/`, NOT library)

When a prototype drives the TOC from a store, wrap it in an app-level custom element that owns the writable `TocModel`, derives it from the store, and injects the **read-only** view. Follow the wrapper pattern + lifecycle rules in **`plan.md` §4** rather than repeating them (construct the model empty, sync in `connectedCallback` via `subscribeMany({ immediate: true })`, clean up per connect, never read the store in a field initializer). The wrapper is the **sole writer**: `store → model` reconciles; `view → store` mirrors expansion (the store's `Object.is` guard breaks the echo). Dependency points **app → library**. Keep it minimal.

---

## Out of scope — do NOT

- **Do not reintroduce a full re-render** (`replaceChildren` of the tree) as a change path. All-surgical is the design; `render()` is initial-build only.
- **Do not add origin/source filtering** to events. Programmatic methods emit `change`; feedback-loop avoidance is the consumer's job (idempotent updates), not the widget's.
- **Do not let `<toc-node>` own domain** or touch the model/index. The node is presentation only; the widget owns the index; the model owns the tree.
- **Do not build child `<ul>`s eagerly.** The *row* is always uniform, but the *child list* stays lazy (built on expand, removed on collapse).
- **No ViewModel.** View-state stays in the widget — correct at this size. (If rows later gain rich per-node state/behavior, revisit; not now.)

---

## Tests — the safety net for going surgical (this is central)

Surgical trades "dumb but infallible" (a full re-render can't drift from the model) for "efficient but must sync correctly." **Tests are the net that catches drift** — this is where the testing priority pays for itself.

- **DOM-vs-model parity (the key test).** Keep a **test-only reference builder** — a pure function that builds the full expected DOM from the model + expanded set (essentially the old full render). After **each** operation (`add`, `remove`, `move`, `expand`, `collapse`, `toggle`) **and combinations of them**, assert the surgically-updated DOM **equals** what the reference builder produces. This is the oracle that proves surgical stays correct.
- **Index integrity.** After any prune (`collapse`, `remove`, `move`, `clear`), assert the index keys **exactly equal** the set of currently-rendered node ids — no stale entries, no missing ones.
- **Lazy build.** Expanding a collapsed ancestor renders previously-absent descendants (and registers them); collapsing removes them from **both** the DOM and the index.
- **Expansion survives node destruction (the reason expansion state lives in the widget).** Expand a deep descendant, collapse its ancestor (destroying the descendant's `<toc-node>`), then re-expand the ancestor — assert the descendant is **expanded again**. The `Set` remembered it; a per-node boolean would have lost it.
- **Toggle ownership.** A click on a node's toggle results in the **widget** updating `#expanded` and calling `node.setExpanded(...)` — the node emits its event but does not own the resulting state.
- **Leaf/branch transitions.** `add` first child → toggle appears (`setLeaf(false)`), `aria-expanded="false"`; `remove`/`move` last child away → toggle hides (`setLeaf(true)`), no `aria-expanded`.
- **`move` cases.** Into an expanded parent (re-parented, correct indentation); into a collapsed parent (dropped, then rebuilt on expand); a cycle-creating move is **rejected by the model** (widget does nothing).
- **Focus / input preserved by construction.** With an injected `<input>` focused and partially typed, run `expandAll`, a sibling `add`, a `collapse` of an unrelated branch — assert focus, value, and caret are **intact**. (No full re-render destroys them; this **replaces** the old snapshot-restore — preservation is structural now, not restored.)
- **Events.** Click → `clickToggle` then `change`; programmatic → `change` only; `change.detail.expanded` is the current expanded-id snapshot.

---

Deliver strict TypeScript, consistent with the existing file's private-field (`#`) conventions. Files under `src/lib/widgets/toc/`.