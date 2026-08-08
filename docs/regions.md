# Content regions — the shared harvest/fill helper

Read this when building a component that accepts consumer content, or when changing `src/lib/core/regions.ts`. Authoring rules for regions live in the `web-components` skill §7; this file is the helper's own specification.

> **Status:** built and pinned by its own suite (`regions.test.ts`). **It currently has no consumer** — `ui-button` was written as its first, then dropped regions (see `docs/rationale.md`). Kept on purpose, not by omission: the next widget with a header, a footer, or an empty-state needs it, and the mechanism is the one piece of this repo that is genuinely hard to get right twice. Revisit if it is still unused when the third component ships.

## 1. What it is and where it lives

A **content region** is a named, fixed area a consumer can fill — an icon, a label, a header, an empty-state message. The helper does two things and nothing else: **harvest** consumer children off a host at connect, and **fill** an outlet with content.

- Lives in `src/lib/core/regions.ts`, tests co-located as `regions.test.ts`.
- Used only by components that declare regions. A component with no regions does not import it.
- It is **not** Shadow-DOM slots: nodes are *moved* (ownership transfers), and capture is *one-time*. See `docs/rationale.md`.

## 2. Surface

```ts
export type RegionContent = string | Node | DocumentFragment;
export type HarvestedRegions = Map<string, DocumentFragment>;

export function harvestRegions(
  host: HTMLElement,
  accepted?: readonly string[],
): HarvestedRegions;

export function fillRegion(outlet: Element, content: RegionContent): void;
```

`Map` rather than a record: this is a private field, never state, and a `Map` reads better here. The store's record preference does not apply.

`accepted` is the list of region names the calling component declares (its `regionNames`). It is optional and **dev-only in effect** — it drives the unclaimed-region warning (§5) and changes nothing at runtime in production. Pass it; the one component that cannot is a component that should not be calling harvest at all.

## 3. `harvestRegions`

- Iterates `host.childNodes`, not `children` — bare text (`Save`) must survive.
- Skips whitespace-only text nodes, so pretty-printed HTML does not fill the `default` region and suppress a component's own default.
- An element with `data-region="<name>"` goes to that region; everything else — elements and bare text alike — goes to `default`.
- **Repeated names merge.** Two children carrying `data-region="icon"` both land in the `icon` fragment, in document order. This is not a special case: it is the same append that already merges several unnamed children into `default`. Last-one-wins would silently discard markup the consumer wrote, and throwing would make a cosmetic mistake fatal.
- Moves nodes into per-region `DocumentFragment`s, leaving the host empty.
- Returns a `Map` containing only the regions that received something. A region nobody filled is absent, not an empty fragment.

## 4. `fillRegion`

Replaces the outlet's children.

- A string enters via `textContent`, **never parsed as HTML**.
- A node or fragment is **moved** as-is, never serialized.
- An empty string clears the outlet. This is the documented way to clear a region after render; there is no `unfill`.

## 5. Dev warnings

Two, both stripped in production, both living here rather than in each component so they are written once.

**Loading readyState.** Warns when `document.readyState === 'loading'`, meaning a classic blocking script registered the definition mid-parse and children may be incomplete. Keyed on readyState rather than "harvested nothing", because the spec sets readiness to `interactive` before deferred and module scripts run — so the check identifies the dangerous case directly, and also catches partial harvests. The message names the tag and says an inline script during initial parse is a possible false positive.

**Unclaimed region.** When `accepted` is supplied and a harvested region name is not in it, `console.error` naming the tag, the unrecognised name, and the accepted list.

This closes a real silent-loss hole. Harvest moves the content out of the host into a fragment; if no outlet claims that name, the fragment is dropped and the component's `innerHTML` write covers the tracks. The content is **destroyed with no diagnostic**. It catches two mistakes with one warning: a typo (`data-region="lable"`), and content aimed at a component that has no such region.

Considered and rejected: warning at fill time inside each component. Same information, repeated per component, and a component that skips the check reintroduces the hole.

## 6. What happens to consumer children

The three fates of consumer children — harvested, destroyed with a dev warning, or left as an unmanaged sibling — and the authoring conventions that follow are owned by the skill, §7.1. This spec adds only the helper-side fact behind fate two: harvest empties the host **before** anything knows whether an outlet wants the content, which is exactly why the unclaimed-region warning (§5) lives in the helper and not in each component.

## 7. Tests

Pinned in `regions.test.ts`:

- Named regions land correctly.
- Unnamed children and bare text land in `default`.
- Whitespace-only nodes ignored.
- Host is empty afterwards.
- Strings insert as text (`fillRegion(o, '<b>x</b>')` yields no `<b>`).
- A fragment's children all move.
- The readyState warning fires only in the loading state.

To add with §3 and §5:

- Two children with the same `data-region` both land, in document order.
- A harvested name outside `accepted` warns once, naming the region.
- No `accepted` argument → no unclaimed warning (the check is opt-in, not a trap).
- `fillRegion(outlet, '')` clears a previously filled outlet.

## 8. Open questions

Raise rather than work around, per the same rule that applies to the skill:

- Whether a region cleared after render needs anything beyond `fillRegion(outlet, '')` — an explicit `unfill` was considered and left out as ceremony.
- The `:empty`-hiding convention, and its cost: outlets must be authored with zero inner whitespace or the rule does not match. Cheap, but it is a discipline a component author can forget silently.

## 9. Done

`pnpm test` (this suite), `pnpm typecheck`, `pnpm lint` — all three green.