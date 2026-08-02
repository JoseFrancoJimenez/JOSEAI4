import { describe, it, expect } from 'vitest';
import { ArcGisDataSource, geojsonToEsriPolygon, type ArcGisDataSourceConfig } from './arcgisDataSource.ts';
import { eq } from './filter/ast.ts';
import type { Polygon } from 'geojson';

interface Call { url: string; init?: RequestInit }

function stubFetch(respond: (call: Call) => unknown) {
  const calls: Call[] = [];
  const fn = (async (url: unknown, init?: unknown) => {
    const call: Call = { url: String(url), init: init as RequestInit };
    calls.push(call);
    return {
      ok: true,
      status: 200,
      json: async () => respond(call),
    };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/** Params of a call regardless of GET (query string) vs POST (body). */
function paramsOf(call: Call): URLSearchParams {
  if (call.init?.method === 'POST') return call.init.body as URLSearchParams;
  return new URL(call.url).searchParams;
}

const isCountCall = (call: Call) => paramsOf(call).get('returnCountOnly') === 'true';

const respondQueryAndCount = (features: unknown[], count: number) => (call: Call) =>
  isCountCall(call) ? { count } : { features };

const config: ArcGisDataSourceConfig = {
  url: 'https://example.test/arcgis/rest/services/prov/FeatureServer/0',
  idField: 'OBJECTID',
};

const aoi: Polygon = {
  type: 'Polygon',
  coordinates: [[[-100, 40], [-90, 40], [-90, 50], [-100, 40]]],
};

describe('ArcGisDataSource.query — URL construction', () => {
  it('GETs the page and the count in parallel with shared where', async () => {
    const { fn, calls } = stubFetch(respondQueryAndCount([], 0));
    await new ArcGisDataSource(config, fn).query({ page: { offset: 25, limit: 25 } });

    expect(calls).toHaveLength(2);
    const page = calls.find(c => !isCountCall(c))!;
    const count = calls.find(isCountCall)!;

    expect(page.url.startsWith(`${config.url}/query?`)).toBe(true);
    expect(page.init?.method).toBeUndefined();
    const pageParams = paramsOf(page);
    expect(pageParams.get('f')).toBe('geojson');
    expect(pageParams.get('where')).toBe('1=1');
    expect(pageParams.get('outFields')).toBe('*');
    expect(pageParams.get('returnGeometry')).toBe('true');
    expect(pageParams.get('outSR')).toBe('4326');
    expect(pageParams.get('resultOffset')).toBe('25');
    expect(pageParams.get('resultRecordCount')).toBe('25');

    const countParams = paramsOf(count);
    expect(countParams.get('f')).toBe('json');
    expect(countParams.get('where')).toBe('1=1');
    expect(countParams.get('returnCountOnly')).toBe('true');
  });

  it('compiles baseFilter + user filter into where and honors outFields', async () => {
    const { fn, calls } = stubFetch(respondQueryAndCount([], 0));
    const source = new ArcGisDataSource({ ...config, baseFilter: eq('PRUID', 35) }, fn);
    await source.query({ filter: eq('PRENAME', 'Ontario'), outFields: ['PRENAME', 'LANDAREA'] });

    const page = calls.find(c => !isCountCall(c))!;
    expect(paramsOf(page).get('where')).toBe("(PRUID = 35 AND PRENAME = 'Ontario')");
    expect(paramsOf(page).get('outFields')).toBe('PRENAME,LANDAREA');
    expect(paramsOf(calls.find(isCountCall)!).get('where')).toBe("(PRUID = 35 AND PRENAME = 'Ontario')");
  });

  it('switches both requests to form-encoded POST when a geometry is present', async () => {
    const { fn, calls } = stubFetch(respondQueryAndCount([], 0));
    await new ArcGisDataSource(config, fn).query({ geometry: aoi });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toBe(`${config.url}/query`);
      expect(call.init?.method).toBe('POST');
      const params = paramsOf(call);
      expect(params.get('geometryType')).toBe('esriGeometryPolygon');
      expect(params.get('inSR')).toBe('4326');
      expect(params.get('spatialRel')).toBe('esriSpatialRelIntersects');
      expect(JSON.parse(params.get('geometry')!)).toEqual({
        rings: aoi.coordinates,
        spatialReference: { wkid: 4326 },
      });
    }
  });
});

describe('ArcGisDataSource.query — response handling', () => {
  it('maps features and takes total from the count response', async () => {
    const features = [
      { id: 1, properties: { PRENAME: 'Ontario' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ];
    const { fn } = stubFetch(respondQueryAndCount(features, 13));
    const result = await new ArcGisDataSource(config, fn).query({});

    expect(result.total).toBe(13);
    expect(result.features).toEqual([
      { id: '1', properties: { PRENAME: 'Ontario' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ]);
  });

  it('falls back to properties[idField] when the feature has no id', async () => {
    const features = [{ properties: { OBJECTID: 42, PRENAME: 'Yukon' } }];
    const { fn } = stubFetch(respondQueryAndCount(features, 1));
    const result = await new ArcGisDataSource(config, fn).query({});
    expect(result.features[0]!.id).toBe('42');
  });

  it('throws on non-OK responses', async () => {
    const fn = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(new ArcGisDataSource(config, fn).query({})).rejects.toThrow('HTTP 500');
  });
});

describe('ArcGisDataSource.getById', () => {
  it('queries objectIds with a single GET', async () => {
    const { fn, calls } = stubFetch(() => ({ features: [{ id: 7, properties: {} }] }));
    const feature = await new ArcGisDataSource(config, fn).getById('7');

    expect(calls).toHaveLength(1);
    const params = paramsOf(calls[0]!);
    expect(params.get('objectIds')).toBe('7');
    expect(params.get('f')).toBe('geojson');
    expect(feature?.id).toBe('7');
  });

  it('returns undefined when nothing matches', async () => {
    const { fn } = stubFetch(() => ({ features: [] }));
    expect(await new ArcGisDataSource(config, fn).getById('999')).toBeUndefined();
  });
});

describe('geojsonToEsriPolygon', () => {
  it('passes Polygon rings through', () => {
    expect(geojsonToEsriPolygon(aoi)).toEqual({
      rings: aoi.coordinates,
      spatialReference: { wkid: 4326 },
    });
  });

  it('flattens MultiPolygon polygons into one rings array', () => {
    const multi = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]], [[5.2, 5.2], [5.8, 5.2], [5.8, 5.8], [5.2, 5.2]]],
      ],
    };
    expect(geojsonToEsriPolygon(multi).rings).toEqual([
      [[0, 0], [1, 0], [1, 1], [0, 0]],
      [[5, 5], [6, 5], [6, 6], [5, 5]],
      [[5.2, 5.2], [5.8, 5.2], [5.8, 5.8], [5.2, 5.2]],
    ]);
  });

  it('throws on non-polygon geometries', () => {
    expect(() => geojsonToEsriPolygon({ type: 'Point', coordinates: [0, 0] }))
      .toThrow('unsupported geometry type');
  });
});
