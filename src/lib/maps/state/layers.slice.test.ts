import { describe, it, expect, vi } from 'vitest';
import { createGisStore } from './gisStore.ts';
import {
  layerRegistered,
  layerUnregistered,
  layerVisibilitySet,
  layerOpacitySet,
  layerVariableSet,
  layersHydrated,
  parseLayersSnapshot,
} from './layers.slice.ts';
import { selectLayerState, serializeLayers } from './selectors.ts';

const make = () => {
  const store = createGisStore();
  store.dispatch(layerRegistered('roads', { visible: true, opacity: 1 }));
  return store;
};

describe('layers slice', () => {
  it('registered adds a record retrievable via selectLayerState', () => {
    const store = make();
    expect(selectLayerState(store.getState(), 'roads')).toEqual({ visible: true, opacity: 1 });
    expect(selectLayerState(store.getState(), 'nope')).toBeUndefined();
  });

  it('registered is a no-op when the id already exists', () => {
    const store = make();
    const handler = vi.fn();
    store.subscribe(handler);

    store.dispatch(layerRegistered('roads', { visible: false, opacity: 0.2 }));

    expect(handler).not.toHaveBeenCalled();
    expect(selectLayerState(store.getState(), 'roads')).toEqual({ visible: true, opacity: 1 });
  });

  it('notifies exactly once per mutation', () => {
    const store = make();
    const handler = vi.fn();
    store.subscribe(handler);

    store.dispatch(layerVisibilitySet('roads', false));
    store.dispatch(layerOpacitySet('roads', 0.5));
    store.dispatch(layerVariableSet('roads', 'pop'));

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('mutations replace byId and the inner record immutably', () => {
    const store = make();
    const outerBefore = store.getState().layers.byId;
    const innerBefore = selectLayerState(store.getState(), 'roads');

    store.dispatch(layerVisibilitySet('roads', false));

    expect(store.getState().layers.byId).not.toBe(outerBefore);
    expect(selectLayerState(store.getState(), 'roads')).not.toBe(innerBefore);
    expect(innerBefore).toEqual({ visible: true, opacity: 1 });
  });

  it('identical-value mutations keep state identity and do not notify', () => {
    const store = make();
    const handler = vi.fn();
    store.subscribe(handler);
    const before = store.getState();

    store.dispatch(layerVisibilitySet('roads', true));
    store.dispatch(layerOpacitySet('roads', 1));
    store.dispatch(layerVariableSet('roads', undefined));

    expect(handler).not.toHaveBeenCalled();
    expect(store.getState()).toBe(before);
  });

  it('mutations on unknown ids are silent no-ops', () => {
    const store = make();
    const handler = vi.fn();
    store.subscribe(handler);

    store.dispatch(layerVisibilitySet('ghost', false));
    store.dispatch(layerOpacitySet('ghost', 0.3));
    store.dispatch(layerVariableSet('ghost', 'x'));

    expect(handler).not.toHaveBeenCalled();
    expect(selectLayerState(store.getState(), 'ghost')).toBeUndefined();
  });

  it('opacitySet clamps to [0, 1]', () => {
    const store = make();
    store.dispatch(layerOpacitySet('roads', 1.7));
    expect(selectLayerState(store.getState(), 'roads')!.opacity).toBe(1);
    store.dispatch(layerOpacitySet('roads', -0.4));
    expect(selectLayerState(store.getState(), 'roads')!.opacity).toBe(0);
  });

  it('variableSet sets and clears the variable id', () => {
    const store = make();
    store.dispatch(layerVariableSet('roads', 'pop'));
    expect(selectLayerState(store.getState(), 'roads')!.variableId).toBe('pop');
    store.dispatch(layerVariableSet('roads', undefined));
    expect(selectLayerState(store.getState(), 'roads')!.variableId).toBeUndefined();
  });

  it('unregistered removes the record and notifies once', () => {
    const store = make();
    const handler = vi.fn();
    store.subscribe(handler);

    store.dispatch(layerUnregistered('roads'));

    expect(selectLayerState(store.getState(), 'roads')).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);

    store.dispatch(layerUnregistered('roads')); // now unknown → no-op
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('serialize → parse → hydrate round-trips', () => {
    const source = make();
    source.dispatch(layerVisibilitySet('roads', false));
    source.dispatch(layerOpacitySet('roads', 0.25));
    source.dispatch(layerVariableSet('roads', 'pop'));

    const target = make();
    const snapshot = parseLayersSnapshot(serializeLayers(source.getState()));
    target.dispatch(layersHydrated(snapshot!));

    expect(selectLayerState(target.getState(), 'roads')).toEqual({
      visible: false,
      opacity: 0.25,
      variableId: 'pop',
    });
  });

  it('hydrated patches known ids only and ignores unknown ids', () => {
    const store = make();
    const snapshot = parseLayersSnapshot(JSON.stringify({
      byId: {
        roads: { visible: false, opacity: 0.5 },
        ghost: { visible: false, opacity: 0.1 },
      },
    }));
    store.dispatch(layersHydrated(snapshot!));

    expect(selectLayerState(store.getState(), 'roads')).toEqual({ visible: false, opacity: 0.5 });
    expect(selectLayerState(store.getState(), 'ghost')).toBeUndefined();
  });

  it('parseLayersSnapshot drops malformed records, junk keys, and bad JSON', () => {
    expect(parseLayersSnapshot('not json')).toBeNull();
    expect(parseLayersSnapshot('42')).toBeNull();

    const snapshot = parseLayersSnapshot(JSON.stringify({
      byId: {
        roads: { visible: 'yes', opacity: 5, evil: true },
      },
    }));

    // visible: non-boolean dropped; opacity clamped; junk key dropped
    expect(snapshot).toEqual({ roads: { opacity: 1 } });
  });
});
