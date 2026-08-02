import { describe, it, expect } from 'vitest';
import { createDataSource } from './dataSourceFactory.ts';
import { WfsDataSource } from './wfsDataSource.ts';
import { ArcGisDataSource } from './arcgisDataSource.ts';
import { eq } from './filter/ast.ts';
import type { VectorLayerConfig } from '../layers/types.ts';

const base = {
  label: 'Layer',
  type: 'vector' as const,
  fields: [],
};

describe('createDataSource', () => {
  it('creates a WfsDataSource for kind wfs', () => {
    const config: VectorLayerConfig = {
      ...base,
      id: 'states',
      source: { kind: 'wfs', url: 'https://x.test/wfs', typeName: 'usa:states' },
    };
    expect(createDataSource(config)).toBeInstanceOf(WfsDataSource);
  });

  it('creates an ArcGisDataSource for kind arcgis (idField required)', () => {
    const config: VectorLayerConfig = {
      ...base,
      id: 'provinces',
      idField: 'OBJECTID',
      source: { kind: 'arcgis', url: 'https://x.test/FeatureServer/0' },
    };
    expect(createDataSource(config)).toBeInstanceOf(ArcGisDataSource);

    expect(() => createDataSource({ ...config, idField: undefined }))
      .toThrow('require "idField"');
  });

  it('throws for layers without a data-backend source', () => {
    const config: VectorLayerConfig = {
      ...base,
      id: 'plain',
      source: { type: 'geojson', url: 'https://x.test/data.json' },
    };
    expect(() => createDataSource(config)).toThrow('no data-backend source');
  });

  it('wires the config field list as the query allowlist', async () => {
    const config: VectorLayerConfig = {
      ...base,
      id: 'states',
      fields: [{ id: 'STATE_NAME', label: 'State' }],
      source: { kind: 'wfs', url: 'https://x.test/wfs', typeName: 'usa:states' },
    };
    const source = createDataSource(config);

    // The compile step rejects unknown fields before any fetch happens.
    await expect(source.query({ filter: eq('GHOST', 1) })).rejects.toThrow('unknown field "GHOST"');
  });
});
