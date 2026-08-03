# Checkbox tree — modification plan: per-node `type` + tree-level `cascade | self`

## Status: this modifies EXISTING, WORKING code

The `<checkbox-tree>` / `<tree-node>` widget in `src/lib/widgets/checkbox-tree/` is built and passing. This is a **change plan**, expressed as deltas against what exists — not a rebuild. Do not recreate files or re-derive the architecture; edit in place, keep the existing tests green except where this plan explicitly changes behavior, and commit per task.

### Step 0 (mandatory before any edit) — reconcile this plan with the actual code

This plan uses the concept names from the original build plan (`CheckboxModel`, `#addCheckbox`, `#reflectState`, `#reflectSubtree`, `#reflectAncestors`, `#togglePrimary`, `#descendantLeafIds`, the `checkable` build option, the `checkbox-tree:change` event). **The real implementation may have drifted** — different method names, a merged helper, a slightly different event shape. Before editing, read `tree-node.ts`, `checkbox-tree.ts`, and `tri-state.ts` (or whatever they're actually called), and map each concept below to the real symbol. Where a name differs, follow the code, not this document. If a concept here has no counterpart in the code, that's a signal to re-read, not to invent a new subsystem.

## The change, in one paragraph

Today, checkbox placement is decided by a global `checkable: 'all' | 'leaves'` mode, and every checkbox group cascades. The change splits this into **two independent axes**: (1) a **per-node `type: 'checkbox' | 'label'`** on each def, defaulting to `'label'` (no checkbox), giving the consumer full control over *which* nodes — leaves or groups, any combination — carry a box; and (2) a **single tree-level `checkable: 'cascade' | 'self'`** policy deciding what *checkbox groups* do when toggled. These are orthogonal: `type` controls placement, `checkable` controls group behavior. There is intentionally **no per-group mixing** of cascade and self — the whole tree is one or the other.

## Settled semantics (do not re-litigate)

- **`type` is per node, default `'label'`.** `'label'` = no checkbox (a plain navigable/expandable row). `'checkbox'` = has a box. Applies uniformly to leaves and groups. A bare `build(defs, getLabel)` with no `type`s yields a tree with **zero** checkboxes.
- **`expanded` is per node, default `false` (collapsed).** An optional `expanded?: boolean` on each def sets that node's initial expand state at build. It's meaningful only on branches — ignore it on leaves (nothing to expand). It sets *initial* state only; the tree owns expansion thereafter (user toggles, `expandAll`/`collapseAll`, keyboard) and does not read it again. The flag is literal and **not inherited**: a node with `expanded: true` under a collapsed ancestor still requests its own expansion but remains hidden by that ancestor (it does not force ancestors open).
- **`checkable` is one global policy, default `'cascade'`.** It only governs checkbox **groups**; it is irrelevant to leaves (a leaf has nothing to cascade to). All checkbox groups in a tree follow the same policy — no mix.
- **Cascade mode:** a checkbox group's state is **derived** by aggregating over its **descendant checkbox-leaves** (walk through/past `label` and intermediate `checkbox`-group nodes, collecting only `type='checkbox'` leaves — groups derive, labels have no state). `mixed` is possible. Toggling a checkbox group sets all descendant checkbox-leaves to the new uniform value; toggling any checkbox node recomputes its checkbox-group ancestors. This is today's behavior, restricted to checkbox-leaves.
- **Self mode:** every checkbox node — leaf **or group** — stores its **own** boolean, independent of children. There is **no aggregation, no `mixed`, and no ancestor recomputation**. Toggling a checkbox group flips only its own box.
- **`type: 'label'` nodes are transparent to aggregation** (cascade) and inert (self). A label leaf: `Space` is a no-op. A label group: `Space` falls through to expand/collapse (the current `'leaves'`-mode group path).
- **Benign edge:** a cascade checkbox group with no checkbox-leaf descendants aggregates to `unchecked` and toggling it is a visual no-op. Handle gracefully (no crash); stricter validation is out of scope.
- **Navigation/roving/focus are unaffected** — every row remains navigable regardless of whether it has a checkbox.

## Model impact: nearly none

The pure model (`CheckboxModel`) stays a structure-free `Set` + the same operations. The only conceptual shift: the authoritative set is no longer "checked *leaf* ids" but "checked *checkbox-node* ids that store their own state" — which is checkbox-leaves in cascade mode, and checkbox-leaves **plus checkbox-groups** in self mode. The model doesn't need to distinguish a self-group from a leaf; both are just "a stored boolean." Aggregation (`aggregate`/`toggleGroup`) is simply **never called in self mode**. If the model has a method literally named `toggleLeaf`, it now flips any single stored id (leaf or self-group) — functionally fine; rename to `toggleOne`/`toggle` only if it improves clarity, otherwise leave it.

## Breaking changes — call these out and migrate

1. **`checkable` option values change** from `'all' | 'leaves'` to `'cascade' | 'self'`. Existing call sites must migrate. Mapping: old `'all'` → set every def `type: 'checkbox'` and `checkable: 'cascade'`; old `'leaves'` → set leaf defs `type: 'checkbox'`, group defs `type: 'label'` (or omit → default label), `checkable: 'cascade'`.
2. **Default checkbox placement flips** from "checkboxes present" (old `'all'`) to **none** (`type` defaults to `'label'`). Any consumer relying on the old default now gets a checkbox-free tree until it sets `type`s.
3. **`getChecked()` / change-event payload semantics broaden.** In self mode the result includes checked checkbox-**group** ids, so `checkedLeafIds` would be a misnomer. Rename it to **`checkedIds`** in the `checkbox-tree:change` detail and update `getChecked`'s documented meaning. This ripples to the **app-level store wrapper** in `src/apps/…` that reads `e.detail.checkedLeafIds` — update that call site too (note it in the task; it's outside the widget package but breaks with the rename).

## Tasks

### Task M1 — data + placement (`type` on defs, `checkable` values, per-node checkbox)

**Goal:** placement becomes per-node; the tree still builds and renders correctly (static). No behavior branching yet.

**Do:**
- Extend the def type with `type?: 'checkbox' | 'label'` (default `'label'`). In `build` (and later in `add`/`move`), read it and **stamp it on the node** so later logic and mutation can read it back — e.g. `data-type` (consistent with `data-id`; DOM stays the source of truth). Add a `get type` on the node element if convenient.
- Change the `checkable` build option's accepted values to `'cascade' | 'self'` (default `'cascade'`). Remove the old `'all' | 'leaves'` branching from `build`/render.
- Gate `#addCheckbox(node)` on `node.type === 'checkbox'` — applied uniformly to leaves **and** groups. `label` nodes get no checkbox span and no `aria-checked`.
- Provide/adjust a `#isCheckbox(node)` helper reading `data-type`.
- Extend the def type with `expanded?: boolean` (default `false`). In `build`, after a branch and its children exist, apply it: set the node expanded when `expanded === true` (via the same method a user toggle uses, so `aria-expanded` and the CSS-collapse state stay consistent). Ignore it on leaves.

**Tests:** a def with no `type` renders no checkbox; `type: 'checkbox'` on a leaf and on a group both render a box + `aria-checked`; `type: 'label'` on a group renders an expandable row with `aria-expanded` and **no** `aria-checked`; mixed placement in one tree (checkbox and label nodes interleaved) renders correctly; the old `'all'`/`'leaves'` tests are rewritten to the new option values (or deleted if superseded); a def with `expanded: true` on a branch builds expanded (`aria-expanded="true"`, children not under a collapsed ancestor), `expanded` omitted or on a leaf builds collapsed as before, and a deep branch with `expanded: true` under a collapsed parent stays hidden by the ancestor (initial expand state is per-node, not inherited). Static/build assertions only.

**Done when:** `pnpm vitest run src/lib/widgets/tree` green, `pnpm typecheck` no new errors, `pnpm lint` clean.

### Task M2 — toggle behavior: cascade vs self (+ reflection, `mixed` gating, payload rename)

**Depends on:** M1.
**Goal:** the primary action honors `type` and the global `checkable` policy; aggregation and `mixed` exist only in cascade mode.

**Do:**
- Rework `#togglePrimary(node)` to branch on `(checkable, node.type, node.isLeaf)`:
  - `type: 'label'` group → `node.toggleExpand()`; `type: 'label'` leaf → no-op.
  - `type: 'checkbox'` leaf → flip its own stored boolean; reflect self, and reflect ancestors **only in cascade mode**.
  - `type: 'checkbox'` group + `cascade` → set all descendant checkbox-leaves to the new uniform value; reflect subtree + ancestors.
  - `type: 'checkbox'` group + `self` → flip its own stored boolean; reflect **only itself** (no subtree, no ancestors).
- Generalize descendant enumeration to **checkbox-leaves only** (e.g. `#descendantCheckboxLeafIds` — descendants with `type==='checkbox'` that are leaves; skip label nodes and checkbox groups). Cascade aggregation and cascade group-toggle both use this.
- Update `#reflectState(node)`: `label` → nothing; `checkbox` leaf → `aria-checked` from `model.isChecked(id)`; `checkbox` group + cascade → from `aggregate(#descendantCheckboxLeafIds(node))` (true/false/**mixed**); `checkbox` group + self → from `model.isChecked(id)` (true/false only).
- **Gate `mixed` to cascade mode** — in self mode `aria-checked` and the checkbox `data-state` are only `true`/`false`, never `mixed`. Make `#reflectAncestors` a **no-op in self mode**.
- Rename the change-event detail field `checkedLeafIds` → **`checkedIds`** and update `getChecked`/`setChecked` documented semantics (self-group ids are valid members). **Update the app-wrapper** in `src/apps/…` that reads the old field.

**Tests:** cascade — toggling a checkbox group cascades to descendant checkbox-leaves and sets the group's own `aria-checked` from aggregate; checking every checkbox-leaf under a group flips it to `checked`, unchecking one → `mixed`; label descendants are ignored by aggregation. Self — toggling a checkbox group flips only its own box, descendants untouched, ancestors untouched, `mixed` never appears; `getChecked` includes checked self-groups. Both — `Space`/click on a label leaf is a no-op; on a label group it expands; `checkbox-tree:change` fires on user gesture with `checkedIds`; `setChecked` reflects without emitting. Update the store-wrapper test for the field rename.

**Done when:** suite green, typecheck no new errors, lint clean.

### Task M3 — mutation: `add`/`removeNode`/`move` honor `type` and policy

**Depends on:** M1, M2.
**Goal:** runtime structural change carries `type` and produces correct checkbox/ARIA/roving outcomes under both policies.

**Do:**
- `add`: the def carries `type` (default `'label'`); stamp `data-type` and run `#addCheckbox` when `type==='checkbox'`, for leaves and groups alike. The def's `expanded` (default `false`) sets the new node's initial expand state, same as `build`, applied only if it's a branch. (`move` takes no def and leaves the moved node's expand state untouched.)
- **Remove the old `'leaves'`-mode leaf↔branch checkbox add/remove logic.** Checkbox presence is now driven by `type`, which does **not** change when a node gains/loses children — so a leaf↔branch transition no longer adds or removes a checkbox. Delete that conditional.
- **Re-condition the leaf↔branch storage transition to cascade mode only.** In cascade mode, a `type:'checkbox'` node's storage flips with its structural role: leaf = stored, group = derived. So on checkbox-leaf → checkbox-branch (cascade), **forget** its stored id (it now aggregates); on checkbox-branch → checkbox-leaf (cascade), it becomes an unchecked stored leaf. In **self mode**, a checkbox node stores its own boolean regardless of leaf/branch, so it **keeps** its state across the transition — no forget. (The old code did this keyed on `'leaves'` mode; re-key it on `cascade` + `type==='checkbox'`.)
- `removeNode`: `forget` the removed subtree's stored checkbox ids (checkbox-leaves in cascade; checkbox-leaves + self-groups in self) as it already does; then reflect the former parent's ancestors **only in cascade mode**.
- `move`: moved node keeps its stored checkbox state; reflect **both** old and new parents' ancestors **only in cascade mode**. ARIA re-stamping, roving repair, and cycle prevention are unchanged.

**Tests:** adding a `type:'checkbox'` node under a cascade group re-aggregates ancestors; adding a `type:'label'` node adds no box and (correctly) doesn't affect any aggregate; a checkbox-leaf gaining a child in cascade mode drops its stored state and begins deriving; the same transition in self mode **keeps** its box state; removing/​moving updates ancestors in cascade but not in self; the previously-existing leaf↔branch "checkbox appears/disappears" tests are removed (that behavior is gone). Existing structural/ARIA/roving/cycle tests stay green.

**Done when:** suite green, typecheck no new errors, lint clean.

## Verification (every task)

- `pnpm vitest run src/lib/widgets/tree` — all tests pass; assertions stay synchronous (no `MutationObserver` was introduced, don't add one).
- `pnpm typecheck` — no new errors over baseline. If the app-wrapper is in the same workspace, its typecheck must also pass after the `checkedIds` rename.
- `pnpm lint` on changed files.
- Manual screen-reader spot-check of the new states: a `label` group announces as an expandable item with no checkbox; a `self` checkbox group announces only checked/unchecked (never mixed); a `cascade` checkbox group announces mixed when partially checked.

## Out of scope — do NOT

- No per-group cascade/self mixing (the whole point of this change — `checkable` is one policy per tree).
- No structural model, no `id → element` registry, no `MutationObserver`, no lazy building/virtualization, no store import in the widget — all prior boundaries still hold.
- No new controlled mode, selection model, typeahead, or reordering.
- Do not validate or reject "misconfigured" trees (e.g. a cascade checkbox group with only label descendants) beyond handling them gracefully.