import type { Subscription } from "@mini/lib/core";
import type { LayersSlice, UiSlice, ViewportSlice } from "./keys.ts";

/**
 * Consumer-side contract every widget depends on instead of the concrete `Store` class.
 * Matches `Store<T>`'s full public surface. Domain wiring passes three narrow `Store` instances;
 * single wiring passes the same `AppStore` three times — see facade.test-d.ts for the
 * assignability spike that makes both wirings satisfy this type.
 */
export interface StoreLike<T extends object> {
  get<K extends keyof T & string>(key: K): T[K];
  getAll(): Readonly<T>;
  set<K extends keyof T & string>(key: K, value: T[K]): void;
  update<K extends keyof T & string>(key: K, updater: (prev: T[K]) => T[K]): void;
  batch(fn: () => void): void;
  subscribe<K extends keyof T & string>(
    key: K,
    cb: (value: T[K], previous: T[K]) => void,
    opts?: { immediate?: boolean },
  ): Subscription;
  subscribeMany(
    keys: (keyof T & string)[],
    cb: () => void,
    opts?: { immediate?: boolean },
  ): Subscription;
}

export interface AppStores {
  layers: StoreLike<LayersSlice>;
  ui: StoreLike<UiSlice>;
  viewport: StoreLike<ViewportSlice>;
}
