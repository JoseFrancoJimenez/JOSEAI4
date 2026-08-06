# Implementation Brief — Base `Store` Tool (Vanilla TS, on top of `Evented`)

**For the AI assistant reading this:** Build the base store tool described below. Follow the hard requirements and the target API exactly. Reference implementations are given for the error-prone parts — implement them faithfully. The forbidden-patterns section is non-negotiable. Write the tests listed at the end.

Stack: Vite + TypeScript, vanilla. Be pragmatic — no over-engineering.

**What is library vs. what is example.** §3–§5 (`Evented`, `deepFreeze`, `Store<TState>`) are the **library tool** — they live in `src/lib/core/`. §6–§8 are **app-level usage examples** (a GIS flavour) showing how an app builds domain stores on top; they are **not** library code and belong in an app under `src/apps/`, not `src/lib`. **Library widgets never use this store** — it is for app-level global state; a widget with local state uses its own listener array or its own `Evented` subclass.

---

## 1. Goal & context

The base `Store<TState>` is a **library tool for application global state** (an app's `layers`, `viewport`, `cart`, …). It enforces a strict **unidirectional data flow** with **immutable state**, using a **publish/subscribe** model at **first-level-key granularity**.

It is built on an existing `Evented<TEvents>` base class (typed event emitter, provided below). Its `emit`/`off` are `protected` — this is deliberate and must be preserved: only the store emits changes, consumers only subscribe. That protection *is* the unidirectional-flow guarantee.

We deliberately reject the "clone everything on every read/write" approach. Instead we get safety from **immutability-by-convention + deep-freeze in development only** (stripped in production), and **reference equality** for change detection. Rationale for every one of these choices is in §10. (The GIS payloads mentioned below are just the running example — the tool itself is domain-agnostic.)

---

## 2. Hard requirements (non-negotiable)

1. **No cloning on read or write.** `get()` returns the stored reference; `set()` stores the reference it's given. No `structuredClone`, no deep copy, anywhere in the hot path. (The reason: our characteristic payload is large GeoJSON; clone-on-read would deep-copy megabytes per reader.)
2. **Change detection is `Object.is` on references — never serialization.** Do **not** use `JSON.stringify` (or any deep serialize) to compare values. Immutability-by-convention makes reference equality correct and O(1).
3. **State holds plain, serializable data only.** No map instances, DOM nodes, class instances, or functions in any store. The map instance is owned solely by the map controller (§6). Prefer plain object **records** over `Map`/`Set` in state (so the dev freeze actually protects them and state stays trivially serializable for URL/localStorage persistence).
4. **Heavy geo data stays out of state.** Stores hold **ids + light metadata**. Heavy `FeatureCollection`s live in a service-level cache keyed by id (§5, §6).
5. **Domain stores, not one mega-store.** `viewport`, `layers`, `selection`, `data`, `ui` — each its own subclass of the generic `Store<TState>` base.
6. **Dev-only deep freeze.** Freeze every value written to state, recursively, **in development only**. In production the freeze is a no-op passthrough (zero cost).
7. **`Object.freeze` requires strict mode to throw on mutation** — ESM modules are always strict, so this holds. Keep the codebase as ESM.

---

## 3. Provided base class — `Evented` (do not modify)

```typescript
// core/evented.ts  (already exists)
export interface Subscription {
  remove(): void;
}

export interface IEvented<TEvents extends object = Record<string, object>> {
  on<K extends keyof TEvents & string>(event: K, handler: (payload: TEvents[K]) => void): Subscription;
  once<K extends keyof TEvents & string>(event: K, handler: (payload: TEvents[K]) => void): Subscription;
}

export default class Evented<TEvents extends object = Record<string, object>> implements IEvented<TEvents> {
  readonly #handlers = new Map<string, ((payload: any) => void)[]>();

  on<K extends keyof TEvents & string>(event: K, handler: (payload: TEvents[K]) => void): Subscription {
    if (!this.#handlers.has(event)) this.#handlers.set(event, []);
    this.#handlers.get(event)!.push(handler);
    return { remove: () => this.off(event, handler) };
  }

  once<K extends keyof TEvents & string>(event: K, handler: (payload: TEvents[K]) => void): Subscription {
    const sub = this.on(event, (payload) => { handler(payload); sub.remove(); });
    return sub;
  }

  protected off<K extends keyof TEvents & string>(event: K, handler: (payload: TEvents[K]) => void): void {
    const handlers = this.#handlers.get(event);
    if (!handlers) return;
    const filtered = handlers.filter(h => h !== handler);
    if (filtered.length) this.#handlers.set(event, filtered);
    else this.#handlers.delete(event);
  }

  protected emit<K extends keyof TEvents & string>(event: K, data: TEvents[K]): void {
    this.#handlers.get(event)?.slice().forEach(h => h(data));
  }
}
```

Notes we rely on: `emit` does `.slice()` before iterating (safe against subscribe/unsubscribe during emit); removal is by handler identity; `Subscription.remove()` is how consumers unsubscribe.

---

## 4. `deepFreeze` + dev guard — reference implementation

```typescript
// src/lib/core/freeze.ts

// This project's stack is Vite:
const DEV: boolean = import.meta.env?.DEV ?? false;

export function deepFreeze<T>(o: T): T {
  // Object.isFrozen check both avoids re-walking shared frozen subtrees
  // and guards against cycles.
  if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
  Object.freeze(o);
  for (const k of Object.keys(o as object)) deepFreeze((o as any)[k]);
  return o;
}

/** In dev: recursively freezes. In prod: identity (zero cost). */
export const guard: <T>(x: T) => T = DEV ? deepFreeze : <T>(x: T) => x;
```

**Known limitation to document in a code comment:** `Object.freeze` does not prevent mutation of `Map`/`Set` *contents* (`map.set(...)` still works on a frozen Map), and `Object.keys` doesn't traverse them. This is another reason requirement 2.3 prefers plain object records in state. If a store must hold a `Map`, treat it as immutable by convention — the freeze won't catch mutations.

---

## 5. Base store — `Store<TState>` — reference implementation

This is the tricky piece (batch semantics + reference equality + typed change events). Implement it as written.

```typescript
// core/store.ts
import Evented, { type Subscription } from './evented';
import { guard } from './freeze';

// Each state key K becomes a `change:${K}` event carrying new + previous value.
type ChangeEvents<TState> = {
  [K in keyof TState & string as `change:${K}`]: {
    value: TState[K];
    previous: TState[K];
  };
};

export default class Store<TState extends object> extends Evented<ChangeEvents<TState>> {
  #state: TState;
  #batchDepth = 0;
  #pending = new Map<string, { value: unknown; previous: unknown }>();

  constructor(initial: TState) {
    super();
    this.#state = {} as TState;
    for (const k of Object.keys(initial) as (keyof TState & string)[]) {
      this.#state[k] = guard(initial[k]); // freeze each slice in dev
    }
  }

  /** Returns the stored reference (frozen in dev). Never a clone. */
  get<K extends keyof TState & string>(key: K): TState[K] {
    return this.#state[key];
  }

  /** Shallow snapshot of all slices. Cheap; values are the same frozen refs. */
  getAll(): Readonly<TState> {
    return { ...this.#state };
  }

  set<K extends keyof TState & string>(key: K, value: TState[K]): void {
    const previous = this.#state[key];
    if (Object.is(previous, value)) return;       // reference-equality no-op
    const next = guard(value);
    this.#state[key] = next;                       // state updates immediately, even in a batch

    if (this.#batchDepth > 0) {
      const existing = this.#pending.get(key);
      // keep the EARLIEST previous (before the batch), and the LATEST value
      this.#pending.set(key, { value: next, previous: existing ? existing.previous : previous });
    } else {
      this.emit(`change:${key}` as any, { value: next, previous } as any);
    }
  }

  /** Ergonomic immutable update: store.update('order', o => [...o, id]) */
  update<K extends keyof TState & string>(key: K, updater: (prev: TState[K]) => TState[K]): void {
    this.set(key, updater(this.#state[key]));
  }

  /** Group multiple sets; each affected key emits exactly once after fn completes. */
  batch(fn: () => void): void {
    this.#batchDepth++;
    try {
      fn();
    } finally {
      if (--this.#batchDepth === 0) {
        const pending = this.#pending;
        this.#pending = new Map();
        for (const [key, { value, previous }] of pending) {
          this.emit(`change:${key}` as any, { value, previous } as any);
        }
      }
    }
  }

  subscribe<K extends keyof TState & string>(
    key: K,
    cb: (value: TState[K], previous: TState[K]) => void,
    opts?: { immediate?: boolean }
  ): Subscription {
    const sub = this.on(`change:${key}`, (e) => cb(e.value, e.previous));
    if (opts?.immediate) {
      const cur = this.#state[key];
      cb(cur, cur); // `previous` is meaningless on the initial call; pass current
    }
    return sub;
  }

  /**
   * Subscribe to several keys at once; coalesces multiple same-tick changes
   * into a single callback via microtask. This is the primary tool for the
   * map-sync effect, which depends on more than one slice.
   */
  subscribeMany(
    keys: (keyof TState & string)[],
    cb: () => void,
    opts?: { immediate?: boolean }
  ): Subscription {
    let scheduled = false;
    const fire = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; cb(); });
    };
    const subs = keys.map((k) => this.on(`change:${k}`, fire));
    if (opts?.immediate) cb();
    return { remove: () => subs.forEach((s) => s.remove()) };
  }
}
```

**Batch semantics to preserve exactly:**
- State is updated *immediately* on every `set`, even inside a batch. Only the *notification* is deferred.
- If the same key is set multiple times in one batch, it emits **once**, with `previous` = the value before the batch started and `value` = the last value set.
- The `Object.is` no-op check runs against live state, so redundant sets inside a batch are skipped correctly.

TypeScript note: the template-literal mapped type may require the `as any` casts shown on `emit`. That's expected; keep them localized to those two lines.

**Two behaviors below are required but not shown in the reference code above** — they were found necessary during hardening (before `app-demo-stores` existed) and confirmed load-bearing by it; the actual `src/lib/core/store.ts` implements both:

- **`subscribeMany` must not fire after `remove()`.** A change schedules a `queueMicrotask` callback; without a `disposed` flag checked *inside* the microtask, a subscription removed between the change and the microtask running still fires — in a web component, that's a callback against an already-torn-down element after `disconnectedCallback`. `app-demo-stores`'s remount stress pass (Task 27) depends on this directly: every one of the app's seven widgets is detached and reattached, and none may receive a post-disconnect callback.
- **Subscriber error isolation.** A throwing handler must not prevent sibling subscribers on the same key, or sibling keys in the same batch flush, from being notified. Wrap each handler invocation in try/catch and `console.error`; `Evented.emit`'s own `forEach` already aborts on a throw, so this can't be fixed there without modifying `Evented`.

---

## 6. Example — app-level domain stores (illustrative, NOT library code)

Everything from here to §8 is a **GIS-flavoured example** of building domain stores on the base tool. It belongs in an app under `src/apps/`, **not** in `src/lib`. Copy the *pattern* (subclass, co-located actions, immutable updates, `batch`, the async token guard, heavy-data-out) — the specific domains are just illustration.

Each domain subclasses `Store<TState>` and **co-locates its actions** as methods. Full implementations for `viewport`, `layers`, and `data`; `selection` and `ui` follow the same shape.

### 6.1 `viewport` (the simple case)

```typescript
// stores/viewport.ts
import Store from '../core/store';

export interface ViewportState {
  center: { lat: number; lng: number };
  zoom: number;
  bounds: [number, number, number, number] | null; // [west, south, east, north]
}

export class ViewportStore extends Store<ViewportState> {
  constructor() {
    super({ center: { lat: 0, lng: 0 }, zoom: 2, bounds: null });
  }

  /** One batched action -> a single flush for the three slices. */
  setView(v: Partial<ViewportState>): void {
    this.batch(() => {
      if (v.center) this.set('center', v.center);
      if (v.zoom != null) this.set('zoom', v.zoom);
      if (v.bounds !== undefined) this.set('bounds', v.bounds);
    });
  }
}
```

### 6.2 `layers` (the interesting case)

Uses a **plain object record** (not a `Map`) so the dev freeze protects it and it stays serializable. Draw order is a separate `string[]`. Every mutation creates new references — never mutate in place.

```typescript
// stores/layers.ts
import Store from '../core/store';

// LIGHT metadata only — no geometry here.
export interface LayerState {
  id: string;
  visible: boolean;
  opacity: number;
  source: string;
}

interface LayersState {
  byId: Record<string, LayerState>;
  order: string[]; // draw order
}

export class LayersStore extends Store<LayersState> {
  constructor() {
    super({ byId: {}, order: [] });
  }

  /** Derived view with the exact shape the map-sync effect diffs against. Recomputed on read. */
  get drawList(): LayerState[] {
    const byId = this.get('byId');
    return this.get('order').map((id) => byId[id]).filter((l) => l && l.visible);
  }

  add(def: LayerState): void {
    this.batch(() => {
      this.set('byId', { ...this.get('byId'), [def.id]: { visible: true, opacity: 1, ...def } });
      this.set('order', [...this.get('order'), def.id]);
    });
  }

  toggle(id: string): void {
    const byId = this.get('byId');
    const l = byId[id];
    if (!l) return;
    this.set('byId', { ...byId, [id]: { ...l, visible: !l.visible } }); // new outer + new inner
  }

  setOpacity(id: string, opacity: number): void {
    const byId = this.get('byId');
    const l = byId[id];
    if (!l) return;
    this.set('byId', { ...byId, [id]: { ...l, opacity } });
  }

  reorder(order: string[]): void {
    this.set('order', order);
  }
}
```

> There is no `computed` primitive in pub/sub, so `drawList` is a plain getter recomputed on demand. Consumers that need to react to it subscribe to both `byId` and `order` via `subscribeMany` (see §6.5) — this is the deliberate trade-off of pub/sub vs. signals: derivation is manual and key-coarse.

### 6.3 `data` (async action + service cache + stale-response guard)

This is where heavy data is kept **out** of state and where out-of-order responses are guarded.

```typescript
// stores/data.ts
import Store from '../core/store';
import type { GeoApi } from '../services/api';
import type { FeatureCache } from '../services/feature-cache';

export interface DataState {
  filters: { bbox: [number, number, number, number] | null; category: string };
  status: 'idle' | 'loading' | 'ready' | 'error';
  resultIds: string[]; // ids only — heavy FeatureCollections live in the cache
  error: string | null;
}

export class DataStore extends Store<DataState> {
  #token = 0;

  constructor(private api: GeoApi, private cache: FeatureCache) {
    super({ filters: { bbox: null, category: 'all' }, status: 'idle', resultIds: [], error: null });
  }

  setFilters(patch: Partial<DataState['filters']>): void {
    this.set('filters', { ...this.get('filters'), ...patch });
  }

  async run(): Promise<void> {
    const id = ++this.#token; // guard token
    this.set('status', 'loading');
    try {
      const fc = await this.api.query(this.get('filters'));
      if (id !== this.#token) return; // a newer request superseded us -> drop
      const ids = this.cache.put(fc); // heavy data goes to the cache, not state
      this.batch(() => {
        this.set('resultIds', ids);
        this.set('status', 'ready');
        this.set('error', null);
      });
    } catch (e) {
      if (id !== this.#token) return;
      this.batch(() => {
        this.set('error', String(e));
        this.set('status', 'error');
      });
    }
  }
}
```

The `#token` guard matters specifically in GIS: fast pan/filter fires overlapping queries that return out of order; without it you paint stale results over fresh ones.

### 6.4 `selection` and `ui` (skeletons — same pattern)

```typescript
// stores/selection.ts
import Store from '../core/store';

interface SelectionState {
  featureId: string | null;
  hoverId: string | null;
}

export class SelectionStore extends Store<SelectionState> {
  constructor() { super({ featureId: null, hoverId: null }); }
  select(id: string | null): void { this.set('featureId', id); }
  hover(id: string | null): void { this.set('hoverId', id); }
}
```

```typescript
// stores/ui.ts
import Store from '../core/store';

interface UiState {
  panelOpen: boolean;
  activeTool: 'pan' | 'measure' | 'draw';
}

export class UiStore extends Store<UiState> {
  constructor() { super({ panelOpen: true, activeTool: 'pan' }); }
  togglePanel(): void { this.update('panelOpen', (v) => !v); }
  setTool(t: UiState['activeTool']): void { this.set('activeTool', t); }
}
```

### 6.5 Wiring the stores together

Start with **module singletons** (simplest, fine for a single map on the page):

```typescript
// stores/index.ts
import { ViewportStore } from './viewport';
import { LayersStore } from './layers';
import { SelectionStore } from './selection';
import { DataStore } from './data';
import { UiStore } from './ui';
import { GeoApi } from '../services/api';
import { FeatureCache } from '../services/feature-cache';

const cache = new FeatureCache();
const api = new GeoApi();

export const viewport = new ViewportStore();
export const layers = new LayersStore();
export const selection = new SelectionStore();
export const data = new DataStore(api, cache);
export const ui = new UiStore();
```

Provide a `createStores()` factory variant too (same wiring, returns an object of fresh instances). Recommend singletons now; note in a comment that the factory is the upgrade path for isolated tests and for supporting two maps on one page — at which point instances are distributed via a context protocol instead of importing the singletons.

---

## 7. Map controller & sync (the payoff)

One module is the **sole owner** of the map instance. It hosts both directions of the loop. The map instance never enters any store.

```typescript
// map/sync.ts
import type { Subscription } from '../core/evented';
import type { LayersStore } from '../stores/layers';
import { reconcileLayers } from './reconcile';

/** state -> map: coalesced diff of layers onto the map. */
export function wireLayerSync(map: MapLike, layers: LayersStore): Subscription {
  return layers.subscribeMany(
    ['byId', 'order'],
    () => reconcileLayers(map, layers.drawList), // add/remove/reorder only the difference
    { immediate: true } // paint current state on wire-up
  );
}
```

```typescript
// map/controller.ts (sketch)
import { viewport, layers, selection } from '../stores';
import { wireLayerSync } from './sync';

export function createMapController(map: MapLike) {
  // map -> state
  map.on('moveend', () =>
    viewport.setView({ center: map.getCenter(), zoom: map.getZoom(), bounds: map.getBounds() })
  );
  map.on('click', (e: any) => selection.select(featureAt(e.latlng)));

  // state -> map
  const subs = [wireLayerSync(map, layers)];

  return { destroy: () => subs.forEach((s) => s.remove()) };
}
```

Implement `reconcileLayers(map, drawList)` as a stub with a clear TODO — it's genuinely map-library-specific (Leaflet vs MapLibre vs OpenLayers differ a lot). Its contract: given the current `drawList`, add layers that are new, remove layers no longer present, and update opacity/order for the rest — touching only the difference.

---

## 8. Consuming from a web component (reference)

```typescript
connectedCallback(): void {
  this.sub = viewport.subscribe(
    'zoom',
    (z) => { this.zoomEl.textContent = String(z); },
    { immediate: true } // render current value on mount, not just on next change
  );
}

disconnectedCallback(): void {
  this.sub?.remove();
}
```

Rule for components: **subscribe in `connectedCallback`, `remove()` in `disconnectedCallback`.** Components never call `set` on a store directly except through a store action; they never emit.

---

## 9. Tests (Vitest) — required

These pin the behaviors that are easy to get wrong. Include all of them.

1. `set` notifies subscribers with `(value, previous)`.
2. `set` with the **same reference** is a no-op — no notification (`Object.is` short-circuit).
3. `set` with a **new reference of equal contents** *does* notify. (This proves we are reference-based, not content-based — the opposite of the rejected `JSON.stringify` approach.)
4. `Subscription.remove()` stops further notifications.
5. `batch`: setting several **different** keys emits each affected key exactly once, after the batch completes (assert emit count and ordering).
6. `batch`: setting the **same** key multiple times emits once, with `previous` = pre-batch value and `value` = last set.
7. `subscribeMany` coalesces multiple same-tick changes into a **single** callback (async test awaiting a microtask).
8. `subscribeMany({ immediate: true })` fires once synchronously on subscribe.
9. `subscribe({ immediate: true })` fires the callback synchronously with the current value.
10. Dev freeze: with the dev guard active, mutating a value returned by `get()` **throws** (guards accidental mutation).
11. `DataStore.run`: an earlier in-flight request whose response resolves *after* a later request does **not** overwrite state (stale-token guard).
12. `subscribeMany`: change a key, call `remove()` on the subscription synchronously, then await a microtask — the callback must never run.
13. A throwing subscriber does not prevent sibling subscribers on the same key, or sibling keys in the same batch flush, from being notified.

---

## 10. Forbidden patterns (do not reintroduce — with reasons)

- **No `structuredClone` / deep copy in `get` or `set`.** Reason: heavy GeoJSON; clone-on-read deep-copies megabytes per reader. We use immutability-by-convention + dev freeze instead.
- **No `JSON.stringify` (or any deep serialize) for equality.** Reason: it's O(n), key-order-sensitive (false positives), and blind to `Map`/`Set`/`undefined`/`NaN` (silent missed notifications). Use `Object.is` on references.
- **No non-plain data in any store** — no map instances, DOM nodes, class instances, or functions. The map instance is owned only by the map controller.
- **No heavy feature geometry in state.** Store ids + light metadata; heavy `FeatureCollection`s live in the `FeatureCache` keyed by id.
- **No emitting from consumers.** `Evented.emit`/`off` stay `protected`. State changes only through store actions/`set`.
- **Prefer plain object records over `Map`/`Set` in state** — so the dev freeze protects them and state stays serializable.
- **Do not mutate in place.** Every action creates new references (`{ ...obj }`, `[...arr]`) so reference equality correctly signals change and structural sharing stays sound.

---

## 11. File structure

**Library tool (the deliverable) — `src/lib/core/`:**
```
src/lib/core/
  evented.ts     # provided — do not modify
  freeze.ts      # deepFreeze + guard (§4)
  store.ts       # Store<TState> base (§5)
  store.test.ts  # §9 (1–10)
```

**App-level example (§6–§8) — lives in an app under `src/apps/`, NOT in `src/lib`:**
```
src/apps/<app>/
  stores/        # viewport, layers, data, selection, ui, index (§6)
  services/      # api (GeoApi), feature-cache (§6.3) — GIS-specific
  map/           # controller, sync, reconcile (§7) — map-library-specific
  data.test.ts   # §9 (11)
```

Deliver strict TypeScript throughout, ESM modules. The **library core** has **no runtime dependencies**. GIS/map dependencies exist only in the app-level example, never in `src/lib`.

---

## 12. Findings from `app-demo-stores` (validation)

`app-demo-stores` (`src/apps/app-demo-stores/`, `docs/tasks/store-tasks.md`) put this store under real
pressure: an OpenLayers map, seven widgets, two independent wirings of the same widget code (one
`AppStore` vs. three domain stores), and a shareable URL. What it confirmed, and the one real gap
it found, follows — per Task 27's stress pass.

**Confirmed — record as settled, not just illustration:**

- **The two-wiring facade holds with zero adapter code.** `StoreLike<T>`'s methods are declared
  with method syntax specifically so TypeScript's method bivariance makes `Store<AppState>`
  assignable to `StoreLike<NarrowSlice>` — proven with a type-only spike *before* any widget was
  written against it (see `state/facade.test-d.ts`). Both `createDomainStores` and
  `createSingleStores` satisfy the exact same `AppStores` facade type with no cast, anywhere.
- **Widget code really can be wiring-agnostic.** All seven widgets, plus the table's data helper,
  contain zero conditionals on which wiring is active (Task 27 check 1) — grepped by an automated
  test, not eyeballed.
- **The three different echo-guard mechanisms this brief's app-level examples never needed are
  all real, and each needs a genuinely different shape:** (a) content-comparison
  compare-before-write for view-state mirrored back to the store (TOC/legend expansion — a
  freshly built array never matches by `Object.is`); (b) an `applyingFromStore` flag *plus* a
  numeric tolerance for a two-way binding against an external, float-drifting API (the map
  viewport); (c) *no guard at all* where the reflection is structural (the checkbox tree's
  `setChecked` reflects without emitting, so store -> view is already a dead end). Reaching for
  the same guard shape in all three places would have been wrong in two of them.
- **Nested `batch()` composes correctly across action-level abstractions**, not just raw `set`
  calls in one function: the TOC's tree -> store write wraps two `setVisibleMany` calls (each a
  single `set` internally) in one outer `stores.layers.batch(...)`, and it coalesces into exactly
  one emission — confirmed by an explicit emit-count assertion, including at a stress scale of 20
  layers in one group (Task 27 check 3).
- **The async stale-response token pattern (§6.3) generalizes past GIS.** The table widget's
  per-instance incrementing token, guarding a plain `fetch` against out-of-order responses, is
  the identical shape as `DataStore.run`'s `#token` — confirms it as a general recipe, not an
  artifact of the original GeoJSON example.
- **"Restore before wiring" really does remove the need for cross-store batching.** The shared
  composition root (`composeApp.ts`) resolves the full initial state — config defaults merged
  with a decoded share link — *before* any store or widget exists. Nothing is subscribed yet, so
  there is nothing to coalesce across stores. No `batchAcross` helper was needed anywhere in the
  app.
- **Config objects never enter a store, confirmed structurally, not just by convention.** Every
  place a config-derived value enters state derives a small new plain value (`{ id, visible }`
  for a layer; a `string` for an active variable id) — never the config object itself. Dev-freeze
  therefore never touches (and never corrupts) the shared config module singleton, verified with
  an explicit mutation-after-seed test (Task 27 check 7).
- **Heavy data really does stay out of state, even for a widget with real async rows.** The
  table's fetched feature rows live only in a per-widget-instance `Map` cache; `getAll()` on
  every slice holds only ids and light metadata throughout, including after paging through every
  layer (Task 27 check 6) — the same rule §6.3's `resultIds`-not-`FeatureCollection` illustrates,
  now proven under a real (if minimal) fetch.

**A real gap found, unrelated to the store tool itself:** `src/lib/maps/data/{arcgisDataSource,
wfsDataSource}.ts` — a sibling lib module the store-tasks plan pointed the table widget at — only
accepts `source.kind: 'wfs' | 'arcgis'` (a live, server-paginated backend). This app's actual
layer configs carry `source.type: 'geojson' | 'esrijson'`, pointing at static files, a shape
those classes don't accept at all. The table widget could not reuse them and instead implements
its own minimal static-file fetch + client-side pagination (`widgets/table/rows.ts`) — this is
not a case of "do not reimplement paging that they already do," since no paging exists anywhere
for this data shape. Flagged here, not filed as a store-tool defect, because it isn't one.

**A test-authoring gotcha worth naming explicitly**, since it caused repeated, identical mistakes
across many widget tests before the pattern was recognized: `subscribeMany`'s microtask
coalescing means *every* test asserting a side effect of a `subscribeMany`-driven reaction needs
an explicit `await Promise.resolve()` (or, when the reaction itself chains further promises — the
table's `fetch`/`.json()`/`.then()` — a macrotask flush) between the triggering store write and
the assertion. A plain `subscribe()`-driven reaction needs neither; it fires synchronously. Get
this wrong and the test fails not because the code is broken, but because the assertion ran one
tick too early.
