import { describe, it, expect, vi } from 'vitest';
import { createGisStore } from './gisStore.ts';
import { viewChanged } from './view.slice.ts';
import { selectView } from './selectors.ts';

describe('view slice', () => {
  it('starts at a neutral placeholder', () => {
    const store = createGisStore();
    expect(selectView(store.getState())).toEqual({ center: [0, 0], zoom: 0 });
  });

  it('viewChanged sets center and zoom', () => {
    const store = createGisStore();
    store.dispatch(viewChanged([-96, 48], 4));
    expect(selectView(store.getState())).toEqual({ center: [-96, 48], zoom: 4 });
  });

  it('an identical view keeps state identity and does not notify', () => {
    const store = createGisStore();
    store.dispatch(viewChanged([-96, 48], 4));
    const before = store.getState();
    const handler = vi.fn();
    store.subscribe(handler);

    store.dispatch(viewChanged([-96, 48], 4)); // same center + zoom

    expect(store.getState()).toBe(before);
    expect(handler).not.toHaveBeenCalled();
  });

  it('a change in center OR zoom produces a new state', () => {
    const store = createGisStore();
    store.dispatch(viewChanged([-96, 48], 4));

    store.dispatch(viewChanged([-96, 48], 5)); // zoom only
    expect(selectView(store.getState()).zoom).toBe(5);

    store.dispatch(viewChanged([-90, 48], 5)); // lon only
    expect(selectView(store.getState()).center).toEqual([-90, 48]);
  });

  it('selectView returns a fresh array (callers cannot mutate state)', () => {
    const store = createGisStore();
    store.dispatch(viewChanged([-96, 48], 4));
    const a = selectView(store.getState());
    const b = selectView(store.getState());
    expect(a.center).not.toBe(b.center);
  });
});
