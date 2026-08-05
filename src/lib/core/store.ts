/**
 * `batch` is per-instance — there is no cross-store batching.
 * `batch` has no rollback: if `fn` throws, state stays mutated and any pending changes
 * accumulated before the throw still flush on the way out.
 * Derivation is manual and key-coarse — there is no `computed` primitive; consumers that need a
 * value derived from multiple keys recompute it themselves, typically from `subscribeMany`.
 * `subscribe` fires synchronously; `subscribeMany` coalesces into a microtask.
 */

import Evented, { type Subscription } from './evented.ts';
import { guard } from './freeze.ts';

type ChangeEvents<TState> = {
  [K in keyof TState & string as `change:${K}`]: {
    value: TState[K];
    previous: TState[K];
  };
};

class Store<TState extends object> extends Evented<ChangeEvents<TState>> {
  #state: TState;
  #batchDepth = 0;
  #pending = new Map<string, { value: unknown; previous: unknown }>();

  constructor(initial: TState) {
    super();
    this.#state = {} as TState;
    for (const k of Object.keys(initial) as (keyof TState & string)[]) {
      this.#state[k] = guard(initial[k]);
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
    if (Object.is(previous, value)) return;
    const next = guard(value);
    this.#state[key] = next;

    if (this.#batchDepth > 0) {
      const existing = this.#pending.get(key);
      this.#pending.set(key, { value: next, previous: existing ? existing.previous : previous });
    } else {
      this.#emitChange(key, next, previous);
    }
  }

  /** Ergonomic immutable update: `store.update('order', o => [...o, id])`. */
  update<K extends keyof TState & string>(key: K, updater: (prev: TState[K]) => TState[K]): void {
    this.set(key, updater(this.#state[key]));
  }

  /** Group multiple sets; each affected key emits exactly once after `fn` completes. */
  batch(fn: () => void): void {
    this.#batchDepth++;
    try {
      fn();
    } finally {
      if (--this.#batchDepth === 0) this.#flush();
    }
  }

  subscribe<K extends keyof TState & string>(
    key: K,
    cb: (value: TState[K], previous: TState[K]) => void,
    opts?: { immediate?: boolean },
  ): Subscription {
    // Each handler is wrapped individually — Evented.emit's forEach aborts the whole
    // iteration if a handler throws, so isolating one throwing subscriber from its
    // siblings on the same event has to happen here, not around the emit call.
    const sub = this.on(`change:${key}`, (e) => {
      const { value, previous } = e as { value: TState[K]; previous: TState[K] };
      try {
        cb(value, previous);
      } catch (err) {
        console.error(`Store: subscriber for "change:${key}" threw`, err);
      }
    });
    if (opts?.immediate) {
      const cur = this.#state[key];
      cb(cur, cur);
    }
    return sub;
  }

  /**
   * Subscribe to several keys at once; coalesces multiple same-tick changes into a single
   * callback via microtask.
   */
  subscribeMany(
    keys: (keyof TState & string)[],
    cb: () => void,
    opts?: { immediate?: boolean },
  ): Subscription {
    let scheduled = false;
    let disposed = false;
    const fire = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (disposed) return;
        try {
          cb();
        } catch (err) {
          console.error('Store: subscribeMany callback threw', err);
        }
      });
    };
    const subs = keys.map((k) => this.on(`change:${k}`, fire));
    if (opts?.immediate) cb();
    return {
      remove: () => {
        disposed = true;
        subs.forEach((s) => {
          s.remove();
        });
      },
    };
  }

  #flush(): void {
    const pending = this.#pending;
    this.#pending = new Map();
    for (const [key, { value, previous }] of pending) {
      this.#emitChange(key as keyof TState & string, value, previous);
    }
  }

  #emitChange<K extends keyof TState & string>(key: K, value: unknown, previous: unknown): void {
    this.emit(`change:${key}`, { value, previous } as ChangeEvents<TState>[`change:${K}`]);
  }
}

export default Store;
export type { ChangeEvents };
