import { describe, it, expect } from 'vitest';
import { applySharedState, buildSharedState, decodeShareFragment, encodeSharedState } from './share.ts';
import { createGisStore } from './gisStore.ts';
import { layerRegistered, layerVisibilitySet } from './layers.slice.ts';
import { filterSet } from './filter.slice.ts';
import { aoiGeometrySet } from './aoi.slice.ts';
import { viewChanged } from './view.slice.ts';
import { selectAoiGeometry, selectFilterForLayer, selectLayerState, selectView } from './selectors.ts';
import { eq } from '../data/filter/ast.ts';
import type { Polygon } from 'geojson';

const polygon: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const view = { center: [-96, 48] as [number, number], zoom: 4 };

/** A store with the view seeded (the map does this at runtime). */
const seededStore = () => {
  const store = createGisStore();
  store.dispatch(viewChanged(view.center, view.zoom));
  return store;
};

/** Fragment for an arbitrary (possibly invalid) payload. */
const frag = (value: unknown): string =>
  `#s=${btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;

describe('share round-trip', () => {
  it('captures view, layers, filters, and AOI, and restores them from the fragment', () => {
    const store = seededStore();
    store.dispatch(layerRegistered('states', { visible: true, opacity: 1, variableId: 'pop' }));
    store.dispatch(layerVisibilitySet('states', false));
    store.dispatch(filterSet('states', eq('STATE_NAME', 'Maine')));
    store.dispatch(aoiGeometrySet(polygon));

    const shared = buildSharedState(store.getState());
    const decoded = decodeShareFragment(`#s=${encodeSharedState(shared)}`);

    expect(decoded).toEqual({
      view,
      layers: { states: { visible: false, opacity: 1, variableId: 'pop' } },
      filters: { states: eq('STATE_NAME', 'Maine') },
      aoi: polygon,
    });
  });

  it('omits empty filters and a missing AOI', () => {
    const shared = buildSharedState(seededStore().getState());
    expect(shared.filters).toBeUndefined();
    expect(shared.aoi).toBeUndefined();
    expect(decodeShareFragment(`#s=${encodeSharedState(shared)}`)).toEqual({ view, layers: {} });
  });

  it('survives non-ASCII filter values (UTF-8 safe encoding)', () => {
    const store = seededStore();
    store.dispatch(filterSet('states', eq('NAME', 'Ciudad de México — ñ')));
    const decoded = decodeShareFragment(`#s=${encodeSharedState(buildSharedState(store.getState()))}`);
    expect(decoded?.filters?.['states']).toEqual(eq('NAME', 'Ciudad de México — ñ'));
  });
});

describe('applySharedState', () => {
  it('restores view, layer records, filters, and AOI through actions', () => {
    const store = createGisStore();
    // The layer must be registered first — layersHydrated only patches existing records.
    store.dispatch(layerRegistered('states', { visible: true, opacity: 1 }));

    applySharedState(store, {
      view,
      layers: { states: { visible: false, opacity: 0.3 } },
      filters: { states: eq('A', 1) },
      aoi: polygon,
    });

    expect(selectView(store.getState())).toEqual(view);
    expect(selectLayerState(store.getState(), 'states')).toEqual({ visible: false, opacity: 0.3 });
    expect(selectFilterForLayer(store.getState(), 'states')).toEqual(eq('A', 1));
    expect(selectAoiGeometry(store.getState())).toEqual(polygon);
  });
});

describe('decodeShareFragment validation', () => {
  it('returns null for absent or garbage fragments', () => {
    expect(decodeShareFragment('')).toBeNull();
    expect(decodeShareFragment('#other=1')).toBeNull();
    expect(decodeShareFragment('#s=AAAA')).toBeNull(); // decodes, but not JSON
  });

  it('requires a valid view', () => {
    expect(decodeShareFragment(frag({}))).toBeNull();
    expect(decodeShareFragment(frag({ view: { center: [1], zoom: 2 } }))).toBeNull();
    expect(decodeShareFragment(frag({ view: { center: ['a', 'b'], zoom: 2 } }))).toBeNull();
    expect(decodeShareFragment(frag({ view: { center: [0, 0], zoom: null } }))).toBeNull();
  });

  it('drops malformed layers, filters, and AOI individually', () => {
    const decoded = decodeShareFragment(frag({
      view: { center: [0, 0], zoom: 3 },
      layers: { ok: { visible: false, opacity: 7, evil: true }, bad: 42 },
      filters: {
        ok: { kind: 'clause', field: 'A', op: 'eq', value: 1 },
        bad: { kind: 'clause', field: 'A', op: 'nope' },
      },
      aoi: { type: 'Polygon', coordinates: [[[0, 0]]] }, // ring too short
    }));

    expect(decoded).toEqual({
      view: { center: [0, 0], zoom: 3 },
      layers: { ok: { visible: false, opacity: 1 } }, // clamped; junk key + bad record dropped
      filters: { ok: eq('A', 1) },
    });
  });
});
