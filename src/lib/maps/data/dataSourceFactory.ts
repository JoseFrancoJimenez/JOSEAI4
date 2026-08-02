import type { LayerDataSource } from './types.ts';
import type { LayerConfig } from '../layers/types.ts';
import { GeoJsonDataSource } from './geoJsonDataSource.ts';
import { ArcGisDataSource } from './arcgisDataSource.ts';
import { WfsDataSource } from './wfsDataSource.ts';

/** Layer id → data source; built by the app's composition root. */
export type DataSourceRegistry = Map<string, LayerDataSource>;

/**
 * Creates the {@link LayerDataSource} for a vector layer config, dispatching on
 * `source.type`: local `geojson` files query in-memory, while `esrijson` and
 * `wfs` page against their backend. The only sanctioned way to obtain an adapter
 * instance outside `src/lib/maps/data`.
 * @throws {Error} If the layer is not a vector layer.
 */
export function createDataSource(config: LayerConfig): LayerDataSource {
  if (config.type !== 'vector') {
    throw new Error(`Layer "${config.id}" is not a vector layer; it has no data source`);
  }

  // The columns a query may reference: the layer's declared fields. Field names
  // are interpolated into backend query strings, so the compilers reject any
  // clause on a column outside this allowlist.
  const knownFields = config.fields.map(field => field.id);
  const source = config.source;

  switch (source.type) {
    case 'geojson':
      return new GeoJsonDataSource({ url: source.url });
    case 'esrijson':
      return new ArcGisDataSource({ url: source.url, knownFields });
    case 'wfs':
      return new WfsDataSource({ url: source.url, typeName: source.typeName, knownFields });
  }
}
