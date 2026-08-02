/** Returned by `on()`. Call `remove()` to unsubscribe without holding a handler reference. */
export interface Subscription {
  remove(): void;
}

/** Consumer-side contract: subscribe and unsubscribe. Emitting is intentionally internal to the emitter. */
export interface IEvented<TEvents extends object = Record<string, object>> {
  on<K extends keyof TEvents & string>(event: K, handler: (payload: TEvents[K]) => void): Subscription;
  /**
   * Subscribe to an event exactly once. The handler is automatically removed after the first fire.
   * To cancel before the event fires, call `Subscription.remove()` on the returned value.
   * Calling `off(event, handler)` will NOT cancel a once() subscription.
   */
  once<K extends keyof TEvents & string>(event: K, handler: (payload: TEvents[K]) => void): Subscription;
}

/**
 * Generic event emitter. Extend this class and declare a typed event map.
 * `emit` and `off` are protected — only the subclass fires events or removes handlers; consumers use `on`/`once`.
 *
 * ```ts
 * interface MyEvents { 'change:name': { name: string }; }
 * class MyClass extends Evented<MyEvents> {}
 * ```
 */
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