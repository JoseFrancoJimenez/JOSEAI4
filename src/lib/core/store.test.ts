import { describe, it, expect, vi, afterEach } from 'vitest';
import Store from './store.ts';

interface TestState {
  a: number;
  b: string;
  c: string[];
}

function makeStore(initial: Partial<TestState> = {}): Store<TestState> {
  return new Store<TestState>({ a: 1, b: 'x', c: ['p'], ...initial });
}

describe('Store — get / getAll', () => {
  it('get returns the stored reference, not a clone', () => {
    const c = ['p'];
    const store = makeStore({ c });
    expect(store.get('c')).toBe(c);
  });

  it('getAll returns every slice by the same reference', () => {
    const store = makeStore();
    const a = store.get('a');
    const b = store.get('b');
    const c = store.get('c');
    const all = store.getAll();
    expect(all).toEqual({ a, b, c });
    expect(all.c).toBe(c);
  });
});

describe('Store — set', () => {
  it('notifies subscribers with (value, previous)', () => {
    const store = makeStore({ a: 1 });
    const cb = vi.fn();
    store.subscribe('a', cb);
    store.set('a', 2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2, 1);
  });

  it('with the same reference is a silent no-op', () => {
    const c = ['p'];
    const store = makeStore({ c });
    const cb = vi.fn();
    store.subscribe('c', cb);
    store.set('c', c);
    expect(cb).not.toHaveBeenCalled();
  });

  it('with a new reference of equal contents does notify (reference-based, not content-based)', () => {
    const store = makeStore({ c: ['p'] });
    const cb = vi.fn();
    store.subscribe('c', cb);
    store.set('c', ['p']);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('Store — update', () => {
  it('applies the updater and notifies', () => {
    const store = makeStore({ a: 1 });
    const cb = vi.fn();
    store.subscribe('a', cb);
    store.update('a', (n) => n + 1);
    expect(store.get('a')).toBe(2);
    expect(cb).toHaveBeenCalledWith(2, 1);
  });
});

describe('Store — subscribe', () => {
  it('immediate fires synchronously with the current value', () => {
    const store = makeStore({ a: 5 });
    const cb = vi.fn();
    store.subscribe('a', cb, { immediate: true });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(5, 5);
  });

  it('Subscription.remove() stops further notifications', () => {
    const store = makeStore({ a: 1 });
    const cb = vi.fn();
    const sub = store.subscribe('a', cb);
    sub.remove();
    store.set('a', 2);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('Store — dev freeze', () => {
  it('mutating a value returned by get() throws', () => {
    const store = makeStore({ c: ['p'] });
    expect(() => {
      store.get('c').push('q');
    }).toThrow();
  });
});

describe('Store — batch', () => {
  it('setting several different keys emits each affected key exactly once, in insertion order', () => {
    const store = makeStore();
    const order: string[] = [];
    store.subscribe('b', () => order.push('b'));
    store.subscribe('a', () => order.push('a'));
    store.subscribe('c', () => order.push('c'));

    store.batch(() => {
      store.set('b', 'y');
      store.set('a', 2);
      store.set('c', ['q']);
    });

    expect(order).toEqual(['b', 'a', 'c']);
  });

  it('setting the same key repeatedly in a batch emits once, with pre-batch previous and final value', () => {
    const store = makeStore({ a: 1 });
    const cb = vi.fn();
    store.subscribe('a', cb);

    store.batch(() => {
      store.set('a', 2);
      store.set('a', 3);
      store.set('a', 4);
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(4, 1);
  });

  it('a redundant same-reference set inside a batch emits nothing', () => {
    const c = ['p'];
    const store = makeStore({ c });
    const cb = vi.fn();
    store.subscribe('c', cb);

    store.batch(() => {
      store.set('c', c);
    });

    expect(cb).not.toHaveBeenCalled();
  });
});

describe('Store — batch: depth and failure handling', () => {
  it('state updates immediately on every set, even inside a batch', () => {
    const store = makeStore({ a: 1 });
    store.batch(() => {
      store.set('a', 2);
      expect(store.get('a')).toBe(2);
    });
  });

  it('nested batch flushes only at depth 0', () => {
    const store = makeStore({ a: 1 });
    const cb = vi.fn();
    store.subscribe('a', cb);

    store.batch(() => {
      store.set('a', 2);
      store.batch(() => {
        store.set('a', 3);
      });
      expect(cb).not.toHaveBeenCalled();
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(3, 1);
  });

  it('a batch whose fn throws still flushes and leaves state mutated', () => {
    const store = makeStore({ a: 1 });
    const cb = vi.fn();
    store.subscribe('a', cb);

    expect(() => {
      store.batch(() => {
        store.set('a', 2);
        throw new Error('boom');
      });
    }).toThrow('boom');

    expect(store.get('a')).toBe(2);
    expect(cb).toHaveBeenCalledWith(2, 1);
  });
});

describe('Store — subscribeMany', () => {
  it('coalesces multiple same-tick changes into a single callback', async () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribeMany(['a', 'b'], cb);

    store.set('a', 2);
    store.set('b', 'y');
    expect(cb).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('immediate fires once synchronously on subscribe', () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribeMany(['a', 'b'], cb, { immediate: true });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('remove() detaches all keys', async () => {
    const store = makeStore();
    const cb = vi.fn();
    const sub = store.subscribeMany(['a', 'b'], cb);
    sub.remove();

    store.set('a', 2);
    store.set('b', 'y');
    await Promise.resolve();

    expect(cb).not.toHaveBeenCalled();
  });

  it('does not fire after remove(), even if a microtask was already scheduled', async () => {
    const store = makeStore();
    const cb = vi.fn();
    const sub = store.subscribeMany(['a'], cb);

    store.set('a', 2); // schedules the microtask
    sub.remove(); // torn down before the microtask runs
    await Promise.resolve();
    await Promise.resolve();

    expect(cb).not.toHaveBeenCalled();
  });
});

describe('Store — subscriber error isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a throwing subscriber does not prevent other subscribers for the same key', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = makeStore({ a: 1 });
    const good = vi.fn();
    store.subscribe('a', () => {
      throw new Error('boom');
    });
    store.subscribe('a', good);

    expect(() => {
      store.set('a', 2);
    }).not.toThrow();

    expect(good).toHaveBeenCalledWith(2, 1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('a throwing subscriber does not prevent other keys in a batch flush from being notified', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = makeStore({ a: 1, b: 'x' });
    const bCb = vi.fn();
    store.subscribe('a', () => {
      throw new Error('boom');
    });
    store.subscribe('b', bCb);

    store.batch(() => {
      store.set('a', 2);
      store.set('b', 'y');
    });

    expect(bCb).toHaveBeenCalledWith('y', 'x');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe('Store — re-entrancy', () => {
  it('calling set from inside a subscriber is deterministic: the nested change notifies before the outer subscriber returns', () => {
    const store = makeStore({ a: 1, b: 'x' });
    const order: string[] = [];

    store.subscribe('a', () => {
      order.push('a-start');
      store.set('b', 'y');
      order.push('a-end');
    });
    store.subscribe('b', () => {
      order.push('b');
    });

    store.set('a', 2);

    expect(order).toEqual(['a-start', 'b', 'a-end']);
  });

  it('a subscriber added during an emit is not called for the in-flight event', () => {
    const store = makeStore({ a: 1 });
    const late = vi.fn();

    store.subscribe('a', () => {
      store.subscribe('a', late);
    });

    store.set('a', 2);

    expect(late).not.toHaveBeenCalled();
  });
});

describe('Store — subscribe vs subscribeMany timing', () => {
  it('subscribe is synchronous while subscribeMany defers to a microtask', async () => {
    const store = makeStore({ a: 1 });
    const syncCb = vi.fn();
    const manyCb = vi.fn();
    store.subscribe('a', syncCb);
    store.subscribeMany(['a'], manyCb);

    store.set('a', 2);

    expect(syncCb).toHaveBeenCalledTimes(1);
    expect(manyCb).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(manyCb).toHaveBeenCalledTimes(1);
  });
});
