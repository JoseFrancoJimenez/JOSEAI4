import { describe, it, expect, vi } from 'vitest';
import { createGisStore } from './gisStore.ts';
import { selectionSet, selectionCleared, type Selection } from './selection.slice.ts';
import { filterSet, filterCleared } from './filter.slice.ts';
import { aoiGeometrySet, aoiCleared } from './aoi.slice.ts';
import { toolActivated } from './tool.slice.ts';
import { selectSelection, selectFilterForLayer, selectAoiGeometry, selectActiveTool } from './selectors.ts';
import { eq } from '../data/filter/ast.ts';
import type { Polygon } from 'geojson';

const selection: Selection = {
  layerId: 'us-states',
  featureId: 'states.7',
  coordinate: [-96, 40],
};

const polygon: Polygon = {
  type: 'Polygon',
  coordinates: [[[-100, 40], [-90, 40], [-90, 50], [-100, 40]]],
};

describe('selection slice', () => {
  it('starts empty, selects, clears, notifies per mutation', () => {
    const store = createGisStore();
    const handler = vi.fn();
    store.subscribe(handler);

    expect(selectSelection(store.getState())).toBeNull();
    store.dispatch(selectionSet(selection));
    expect(selectSelection(store.getState())).toEqual(selection);
    store.dispatch(selectionCleared());
    expect(selectSelection(store.getState())).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('clear on an empty selection is a no-op', () => {
    const store = createGisStore();
    const handler = vi.fn();
    store.subscribe(handler);
    store.dispatch(selectionCleared());
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('filter slice', () => {
  it('sets and clears per-layer filters with immutable record replacement', () => {
    const store = createGisStore();
    const node = eq('STATE_NAME', 'Maine');
    const before = store.getState().filter.byLayer;

    store.dispatch(filterSet('us-states', node));
    expect(store.getState().filter.byLayer).not.toBe(before);
    expect(selectFilterForLayer(store.getState(), 'us-states')).toBe(node);

    store.dispatch(filterCleared('us-states'));
    expect(selectFilterForLayer(store.getState(), 'us-states')).toBeUndefined();
  });

  it('clear on an unknown layer is a no-op', () => {
    const store = createGisStore();
    const handler = vi.fn();
    store.subscribe(handler);
    store.dispatch(filterCleared('ghost'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('filters for other layers survive set/clear of one layer', () => {
    const store = createGisStore();
    const keep = eq('PRENAME', 'Ontario');
    store.dispatch(filterSet('ca-provinces', keep));
    store.dispatch(filterSet('us-states', eq('A', 1)));
    store.dispatch(filterCleared('us-states'));
    expect(selectFilterForLayer(store.getState(), 'ca-provinces')).toBe(keep);
  });
});

describe('aoi slice', () => {
  it('sets and clears the geometry, notifying per mutation', () => {
    const store = createGisStore();
    const handler = vi.fn();
    store.subscribe(handler);

    store.dispatch(aoiGeometrySet(polygon));
    expect(selectAoiGeometry(store.getState())).toBe(polygon);
    store.dispatch(aoiCleared());
    expect(selectAoiGeometry(store.getState())).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('clear on an empty AOI is a no-op', () => {
    const store = createGisStore();
    const handler = vi.fn();
    store.subscribe(handler);
    store.dispatch(aoiCleared());
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('tool slice', () => {
  it("starts on 'identify' and switches tools", () => {
    const store = createGisStore();
    expect(selectActiveTool(store.getState())).toBe('identify');
    store.dispatch(toolActivated('aoi-draw'));
    expect(selectActiveTool(store.getState())).toBe('aoi-draw');
  });

  it('re-activating the current tool is a no-op', () => {
    const store = createGisStore();
    const handler = vi.fn();
    store.subscribe(handler);
    store.dispatch(toolActivated('identify'));
    expect(handler).not.toHaveBeenCalled();
  });
});
