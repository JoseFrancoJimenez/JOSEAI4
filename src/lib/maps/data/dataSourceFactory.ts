import type { LayerDataSource } from './types.ts';
import type { LayerConfig, VectorLayerConfig } from '../layers/types.ts';
import { collectFilterFields } from './filter/ast.ts';
import { WfsDataSource } from './wfsDataSource.ts';
import { ArcGisDataSource } from './arcgisDataSource.ts';

/** Layer id → data source; built by the app's composition root. */
export type DataSourceRegistry = Map<string, LayerDataSource>;

/**
 * The columns a layer's filters may reference: its declared fields, the id
 * field, and whatever the (trusted) baseFilter itself uses. The compilers
 * reject clauses on anything else — field names are interpolated into query
 * strings, so unknown ones must never get that far.
 */
function knownFieldsFor(config: VectorLayerConfig): string[] {
  const fields = config.fields.map(f => f.id);
  if (config.idField) fields.push(config.idField);
  if (config.baseFilter) fields.push(...collectFilterFields(config.baseFilter));
  return fields;
}

/**
 * Creates the {@link LayerDataSource} for a layer config with a data-backend
 * source (`source.kind: 'wfs' | 'arcgis'`). The only sanctioned way to obtain
 * an adapter instance outside `src/lib/mapping/data`.
 */
export function createDataSource(config: LayerConfig): LayerDataSource {
  if (config.type !== 'vector' || !('kind' in config.source)) {
    throw new Error(`Layer "${config.id}" has no data-backend source`);
  }

  const source = config.source;
  switch (source.kind) {
    case 'wfs':
      return new WfsDataSource({
        url: source.url,
        typeName: source.typeName,
        geometryName: source.geometryName,
        idField: config.idField,
        baseFilter: config.baseFilter,
        knownFields: knownFieldsFor(config),
      });
    case 'arcgis': {
      if (!config.idField) {
        throw new Error(`Layer "${config.id}": arcgis sources require "idField"`);
      }
      return new ArcGisDataSource({
        url: source.url,
        idField: config.idField,
        baseFilter: config.baseFilter,
        knownFields: knownFieldsFor(config),
      });
    }
  }
}
