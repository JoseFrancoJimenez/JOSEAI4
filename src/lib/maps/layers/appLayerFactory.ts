import type { AppLayer } from './baseLayer.ts';
import { VectorAppLayer } from './vectorLayer.ts';
import { ImageAppLayer } from './imageLayer.ts';
import { TileAppLayer } from './tileLayer.ts';
import type { LayerConfig } from './types.ts';
import type { GisStore } from '../state/gisStore.ts';

/**
 * Creates the typed {@link AppLayer} subclass for a layer config. The facade
 * registers its runtime state on construction, so it is fully functional
 * before (and without) being added to a map — hand it to `AppMap.addLayer`
 * to pair it with a native OL layer.
 */
export function createAppLayer(config: LayerConfig, store: GisStore): AppLayer<LayerConfig> {
  switch (config.type) {
    case 'vector': return new VectorAppLayer(config, store);
    case 'image':  return new ImageAppLayer(config, store);
    case 'tile':   return new TileAppLayer(config, store);
  }
}
