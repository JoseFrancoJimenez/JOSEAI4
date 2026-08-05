import { describe, it, expect, vi } from 'vitest';
import { VectorAppLayer } from './vectorLayer.ts';
import { createGisStore } from '../state/gisStore.ts';
import { layerRegistered, layerVisibilitySet, layerOpacitySet, layerVariableSet } from '../state/layers.slice.ts';
import { selectLayerState } from '../state/selectors.ts';
import type { VectorLayerConfig } from './types.ts';

const config: VectorLayerConfig = {
  id: 'states',
  label: 'US States',
  type: 'vector',
  source: { type: 'geojson', url: 'http://example.test/states.json' },
  fields: [{ id: 'pop', label: 'Population' }],
  default_variable: 'pop',
  variables: [
    { id: 'pop', renderer: [{ 'fill-color': 'red' }], legend: { items: [{ label: 'People' }] } },
    { id: 'area', renderer: [{ 'fill-color': 'blue' }] },
  ],
};

const make = () => {
  const store = createGisStore();
  store.dispatch(layerRegistered('states', { visible: true, opacity: 1, variableId: 'pop' }));
  return { store, layer: new VectorAppLayer(config, store) };
};

describe('AppLayer store delegation', () => {
  it('visible getter reads the store', () => {
    const { store, layer } = make();
    expect(layer.visible).toBe(true);
    store.dispatch(layerVisibilitySet('states', false));
    expect(layer.visible).toBe(false);
  });

  it('visible setter dispatches layers/visibilitySet', () => {
    const { store, layer } = make();
    const spy = vi.spyOn(store, 'dispatch');
    layer.visible = false;
    expect(spy).toHaveBeenCalledWith(layerVisibilitySet('states', false));
  });

  it('opacity getter reads the store, setter dispatches layers/opacitySet', () => {
    const { store, layer } = make();
    const spy = vi.spyOn(store, 'dispatch');
    layer.opacity = 0.5;
    expect(spy).toHaveBeenCalledWith(layerOpacitySet('states', 0.5));
    expect(layer.opacity).toBe(0.5);
  });

  it('constructor registers initial runtime state from config, incl. the default variable', () => {
    const store = createGisStore();
    const layer = new VectorAppLayer(config, store);
    expect(selectLayerState(store.getState(), 'states')).toEqual({
      visible: true,
      opacity: 1,
      variableId: 'pop',
    });
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
  });

  it('pre-seeded state wins over the constructor registration', () => {
    const store = createGisStore();
    store.dispatch(layerRegistered('states', { visible: false, opacity: 0.5, variableId: 'area' }));
    const layer = new VectorAppLayer(config, store);
    expect(layer.visible).toBe(false);
    expect(layer.opacity).toBe(0.5);
    expect(layer.variable?.id).toBe('area');
  });
});

describe('VectorAppLayer variables', () => {
  it('variable getter resolves the store variableId against config', () => {
    const { store, layer } = make();
    expect(layer.variable?.id).toBe('pop');
    store.dispatch(layerVariableSet('states', 'area'));
    expect(layer.variable?.id).toBe('area');
    store.dispatch(layerVariableSet('states', undefined));
    expect(layer.variable).toBeUndefined();
  });

  it('setVariable validates then dispatches layers/variableSet', () => {
    const { store, layer } = make();
    const spy = vi.spyOn(store, 'dispatch');
    layer.setVariable('area');
    expect(spy).toHaveBeenCalledWith(layerVariableSet('states', 'area'));
  });

  it('setVariable throws on an unknown id without touching the store', () => {
    const { store, layer } = make();
    const spy = vi.spyOn(store, 'dispatch');
    expect(() => layer.setVariable('nope')).toThrow('Variable "nope" not found in layer "states"');
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolveVariable returns the config entry and throws on unknown ids', () => {
    const { layer } = make();
    expect(layer.resolveVariable('area').renderer).toEqual([{ 'fill-color': 'blue' }]);
    expect(() => layer.resolveVariable('nope')).toThrow();
  });

  it('legend reflects the current store variableId', () => {
    const { store, layer } = make();
    expect(layer.legend.items).toEqual([{ label: 'People' }]);
    expect(layer.legend.subLabel).toBe('Population');
    store.dispatch(layerVariableSet('states', 'area'));
    expect(layer.legend.items).toEqual([]);
  });
});
