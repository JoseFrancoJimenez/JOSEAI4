import { describe, it, expect } from 'vitest';
import { createAppLayer } from './appLayerFactory.ts';
import { VectorAppLayer } from './vectorLayer.ts';
import { ImageAppLayer } from './imageLayer.ts';
import { TileAppLayer } from './tileLayer.ts';
import { createGisStore } from '../state/gisStore.ts';
import { selectLayerState } from '../state/selectors.ts';
import type { LayerConfig } from './types.ts';

const vector: LayerConfig = {
  id: 'v', label: 'Vector', type: 'vector',
  source: { type: 'geojson', url: 'http://x.test/d.json' },
  fields: [],
};
const image: LayerConfig = {
  id: 'i', label: 'Image', type: 'image',
  source: { type: 'wms', url: 'http://x.test/wms', params: { LAYERS: 'a' } },
};
const tile: LayerConfig = {
  id: 't', label: 'Tile', type: 'tile',
  source: { type: 'arcgis_tile', url: 'http://x.test/tiles' },
};

describe('createAppLayer', () => {
  it('creates the subclass matching config.type', () => {
    const store = createGisStore();
    expect(createAppLayer(vector, store)).toBeInstanceOf(VectorAppLayer);
    expect(createAppLayer(image, store)).toBeInstanceOf(ImageAppLayer);
    expect(createAppLayer(tile, store)).toBeInstanceOf(TileAppLayer);
  });

  it('the created facade registered its runtime state (config values honored)', () => {
    const store = createGisStore();
    createAppLayer({ ...tile, visible: false, opacity: 0.4 }, store);
    expect(selectLayerState(store.getState(), 't')).toEqual({ visible: false, opacity: 0.4 });
  });
});
