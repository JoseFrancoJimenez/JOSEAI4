import type { Store } from "@mini/lib/core";
import type { AppState, LayersSlice } from "./keys.ts";
import type { StoreLike } from "./facade.ts";

/**
 * Type-only spike (checked by `pnpm typecheck`, not a runtime test): both the single-store
 * wiring's `Store<AppState>` and the domain wiring's narrow `Store<LayersSlice>` must satisfy
 * `StoreLike<LayersSlice>`. This relies on TypeScript's method bivariance for generic method
 * signatures. If either assignment stops compiling, the facade needs a small adapter object,
 * not a widened `StoreLike` — write it here before Task 10 builds seven widgets against it.
 */
declare const singleStore: Store<AppState>;
declare const domainStore: Store<LayersSlice>;

export const assignableFromSingleStore: StoreLike<LayersSlice> = singleStore;
export const assignableFromDomainStore: StoreLike<LayersSlice> = domainStore;
