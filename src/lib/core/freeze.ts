/**
 * `Object.freeze` does not prevent mutation of `Map`/`Set` **contents** (e.g. `map.set(...)`
 * still works on a frozen `Map`), and `Object.keys` does not traverse into them — so a `Map`/
 * `Set` held in state is not protected by this guard. This is why store state prefers plain
 * object records over `Map`/`Set`.
 */

const DEV: boolean = import.meta.env.DEV;

/**
 * Recursively freezes `o` and everything reachable from it. Returns early on non-objects,
 * `null`, and already-frozen input — this both avoids re-walking shared frozen subtrees and
 * guards against cycles.
 */
function deepFreeze<T>(o: T): T {
  if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
  Object.freeze(o);
  for (const k of Object.keys(o)) deepFreeze((o as Record<string, unknown>)[k]);
  return o;
}

/** In dev: recursively freezes. In prod: identity (zero cost). Selected once at module load. */
const guard: <T>(x: T) => T = DEV ? deepFreeze : <T>(x: T) => x;

export { deepFreeze, guard };
