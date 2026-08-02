# TocComponent — Brief (fixes + library integration)

**For the AI assistant:** `TocComponent` is a **library widget** (in `src/lib/widgets/toc/`), an expandable-tree panel. It is **tier-2 MVVM**: a View plus a `TocModel` (domain — tree structure, cycles, depth), with its small view-state (`#expanded`) **inlined in the element** and **no separate ViewModel** — which is correct at this size (see `plan.md` §2). It renders into **light DOM** (via `replaceChildren` on `this`, **no Shadow DOM**); the focus logic in Fix 3 relies on that. Contract: configured via `setup(model, renderNode)`; communicates out via `CustomEvent` (`clickToggle`, `change`).

Stack: Vite + TypeScript, vanilla. Be pragmatic — no over-engineering. Change only what each item requires; read "Out of scope" before touching event behavior.

**Two parts:** **Part A** = three fixes to the current component. **Part B** = the library-integration contract (read-only model injection) + the app-level wrapper example. Apply Part A and the interface split in Part B; the wrapper is an app-level example (an app under `src/apps/`), not library code.

---

# Part A — Fixes

---

## Fix 1 — Remove stale docs referencing a non-existent `autoToggle` event

The component dispatches **exactly two** events, declared in `static events`:
- `clickToggle` → `'toc:click:toggle'`
- `change` → `'toc:change'`

There is no `autoToggle` event. It's a leftover from an earlier design where programmatic toggles had their own event; that was collapsed into `change`, but some docblocks were never updated.

Do this:
- Search the **whole file** for `autoToggle`, and for any event name in comments/docblocks that isn't one of the two real ones. The known offenders are the docblocks of `#setExpanded` and `#applyExpanded`, but grep the file rather than trusting this list.
- Rewrite the affected docblocks to state the real behavior:
  - `#setExpanded` and `#applyExpanded` **do not emit anything** — they mutate `#expanded` / sync the DOM only. The caller decides which event(s) fire.
  - `#toggle` (the user-click path) emits `clickToggle` **then** `change`.
  - The programmatic methods (`expand`, `collapse`, `expandAll`, `collapseAll`) emit **only** `change`.
- This fix is **comments only** — no code changes.

---

## Fix 2 — Make the two rendering strategies explicit and centralize the full-render path

**Current situation.** Single-node toggles update the DOM surgically (`#setExpanded` → `#applyExpanded`), correctly leaving sibling DOM untouched. But `expandAll`/`collapseAll` and the four model-event handlers (`add`/`remove`/`move`/`clear`) bypass that and call the full `render()`. Rebuilding the whole tree is the *right* choice for bulk and structural changes, but right now it's undocumented and reads like a "leak" in the single-chokepoint story.

**Resolve it by making the split intentional and giving the full-render path a single entry point.**

- Keep **two clearly-named rendering paths**:
  1. **Surgical single-node path** — `#setExpanded` + `#applyExpanded`. Unchanged. Used by single expand/collapse/toggle. Do not alter its behavior.
  2. **Full-render path** — one method, `#renderPreservingFocus()` (defined in Fix 4), which rebuilds the entire visible tree. Used by bulk operations and model-change handlers.
- Route **every** full-render caller through `#renderPreservingFocus()`:
  - The four subscriptions in `bindEvents` (`add`, `remove`, `move`, `clear`) — replace their `this.render()` calls.
  - `expandAll` and `collapseAll` — replace their `this.render()` calls.
- **Leave the initial render as plain `render()`** in `connectedCallback` and `setup` — nothing is focused on first paint, so there's nothing to preserve there.
- Add a short **class-level doc comment** describing the two paths and when each applies, so the split is a documented design decision rather than an accident.

After this fix, `#renderPreservingFocus()` is the single chokepoint for the full-render strategy — which is exactly what makes Fix 2 and Fix 4 converge.

---

## Fix 3 (your point 4) — Preserve focus + in-progress input state across full re-renders

**Problem.** `render()` calls `replaceChildren`, destroying and recreating the whole subtree. Consumers can inject interactive content through `renderNode` (and `interactiveSelector` already anticipates `input`/`button`/`select`/`textarea`/`label`). A full re-render therefore wipes transient DOM state that lives only in the DOM: **focus, caret/selection, scroll position, and typed-but-uncommitted input text.** The surgical single-node path avoids this; the full-render path does not.

**Implement snapshot-and-restore around the full-render path.** Note the design intent: we deliberately keep the "rebuild everything" renderer and patch the focused field back, rather than switching to a reconciling renderer.

Add `#renderPreservingFocus()`:

```
#renderPreservingFocus(): void
  const snapshot = this.#captureActiveState()   // null if nothing inside the component is focused
  this.render()
  if (snapshot) this.#restoreActiveState(snapshot)
```

### `#captureActiveState()` — cheap null in the common case

- `const active = document.activeElement`. If `active` is null or `!this.contains(active)`, **return null**. This guard is the whole point of the cheapness: the overwhelmingly common re-render (nothing focused inside us) pays a single `contains` check and does no snapshot work. (This mirrors the idempotency-guard philosophy used elsewhere — do the expensive thing only when it can matter.)
- Find the enclosing node: `active.closest('.toc-node')`, read its `dataset.nodeId`. If there's no enclosing node, return null.
- Record a **re-find strategy** for `active` within that node, in priority order:
  1. `active.id` if present,
  2. else `active.getAttribute('name')`,
  3. else `{ tagName, index }`, where `index` is `active`'s position among same-tag descendants of the node's content wrapper.
  Document that reliable restoration depends on the consumer giving interactive elements a stable `id` or `name`; the tag+index fallback is best-effort.
- If `active` is a text `<input>` or `<textarea>`, record `value`, `selectionStart`, `selectionEnd`, and `selectionDirection`.
- Record `active.scrollTop` and `active.scrollLeft`.
- Return the snapshot: `{ nodeId, refind, value?, selection?, scrollTop, scrollLeft }`.

### `#restoreActiveState(snapshot)`

- Locate the node's **new** `<li>` by `nodeId` (reuse the existing pattern: `querySelectorAll('.toc-node')` + `find(el => el.dataset.nodeId === id)`). If it isn't found (the node was removed by the model change), **return** — graceful no-op, nothing to restore.
- Re-find the target element inside that `<li>` using the recorded strategy. If not found, **return**.
- If a `value` was recorded, **reapply it** to the element. This is what preserves typed-but-uncommitted text. Note in the docblock that this deliberately overrides the fresh `renderNode` value **for the focused field only** — the user's in-progress edit takes precedence over the regenerated content.
- Call `element.focus()`. If a selection was recorded and the element supports selection, restore `selectionStart` / `selectionEnd` / `selectionDirection`.
- Restore `scrollTop` / `scrollLeft`.
- All of this is **synchronous** — after `replaceChildren`, the new nodes exist immediately, so no `requestAnimationFrame`/timeout is needed.

### Document the limits honestly (in `#renderPreservingFocus`'s docblock)

State plainly what this does and does not cover:
- Only the **single focused element** is preserved. **Not** preserved: non-focused dirty inputs elsewhere in the tree, stateful sub-widgets mounted by `renderNode` (e.g. a nested component or rich-text editor), CSS animation progress, and media playback state.
- For any of those, a **future reconciling renderer** — reusing existing nodes by id instead of `replaceChildren` (optionally via `Node.moveBefore()` to preserve focus during a move) — would be required. Call this out as the documented upgrade path, not something to build now.
- Re-finding the focused element is **heuristic** when consumer elements lack a stable `id`/`name`.

---

# Part B — Library integration

## Read-only model injection (single writer by types)

So a consumer that shares the `TocModel` cannot mutate the tree by accident, split the model's surface into read vs. write. This is a single-writer guarantee **enforced by types, not convention**.

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

- `TocModel implements ITocModelWritable` — **no code change**, it already has all of these.
- Change `setup(model: ITocModelReadable, ...)` — the widget receives the **read-only** interface, so it cannot call `add`/`remove`/`move`/`clear`. The compiler enforces it; any collaborator handed an `ITocModelReadable` is equally locked out. Only whoever holds the concrete `TocModel` can write.

This is a small, high-value change and it's the whole point of the split — do it. Don't add anything beyond it (no runtime guards, no wrappers around the model).

## App-level wrapper (example — an app under `src/apps/`, NOT library)

When a prototype drives the TOC from a store, wrap it in an **app-level custom element** that owns the writable `TocModel`, derives it from the store, and injects the **read-only** view into the widget. Follow the wrapper pattern and lifecycle rules already written in **`plan.md` §4** rather than repeating them here:

- The wrapper is the **sole writer**: `store → model` reconciles the tree; `view → store` mirrors expansion (the store's `Object.is` guard breaks the echo).
- **Construct the model empty**; sync in `connectedCallback` via `subscribeMany([...], sync, { immediate: true })` (covers data-before-mount and data-after-mount in one path). **Never read the store in a field initializer.**
- Clean up subscriptions per connect in `disconnectedCallback`.
- Dependency points **app → library**; the wrapper imports the widget, never the reverse.

This wrapper is illustrative app code — keep it in an app under `src/apps/`, and keep it minimal.

---

## Out of scope — do NOT change these

- **Do not alter the event-emission semantics of the programmatic methods.** `expand`/`collapse`/`expandAll`/`collapseAll` intentionally emit `change` — that is the widget's events-up contract, letting any consumer observe expansion state. Keep it.
- **Do not touch the surgical single-node path's behavior** (`#setExpanded` / `#applyExpanded` / `#toggle` / `#handleClick`). It already preserves sibling DOM state correctly.
- **Keep the public API and both event names unchanged.**

---

## Tests to add / update

1. **Preserve across model change:** with a text input inside a node focused, holding a partial (uncommitted) value and a caret mid-string, fire a model `move`. Assert the same node's input regains focus, its value, and its caret position.
2. **Preserve across bulk op:** with a node's input focused and partially typed, call `expandAll`. Assert focus, value, and selection are preserved.
3. **Cheap path when nothing is focused:** trigger a full re-render (e.g. model `add`) with no element focused inside the component. Assert `#captureActiveState` returns null and no restore work runs (spy/stub `#restoreActiveState` and assert it isn't called, or equivalent).
4. **Focused element inside a removed node:** focus an element in a node, remove that node via the model, assert restoration is a graceful no-op (no throw).
5. **Stable id restoration:** a consumer element carrying a stable `id` is re-found reliably after a full re-render.
6. **Docs are clean:** assert (or manually verify in review) that no docblock references `autoToggle` or any event other than `clickToggle` / `change`.

---

Deliver strict TypeScript, consistent with the existing file's style and its private-field (`#`) conventions.
