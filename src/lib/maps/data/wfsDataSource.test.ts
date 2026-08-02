import { describe, it, expect } from 'vitest';
import { WfsDataSource, geojsonToWkt, type WfsDataSourceConfig } from './wfsDataSource.ts';
import { eq, like } from './filter/ast.ts';
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

const searchOf = (url: string) => new URL(url).searchParams;

const config: WfsDataSourceConfig = {
  url: 'https://example.test/geoserver/wfs',
  typeName: 'usa:states',
  idField: 'STATE_FIPS',
};

const aoi: Polygon = {
  type: 'Polygon',
  coordinates: [[[-100, 40], [-90, 40], [-90, 50], [-100, 40]]],
};

const emptyCollection = { features: [], numberMatched: 0 };

describe('WfsDataSource.query — URL construction', () => {
  it('sends the WFS 2.0 GetFeature boilerplate', async () => {
    const { fn, calls } = stubFetch(() => emptyCollection);
    await new WfsDataSource(config, fn).query({});

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.startsWith('https://example.test/geoserver/wfs?')).toBe(true);
    const search = searchOf(calls[0]!.url);
    expect(search.get('service')).toBe('WFS');
    expect(search.get('version')).toBe('2.0.0');
    expect(search.get('request')).toBe('GetFeature');
    expect(search.get('typeNames')).toBe('usa:states');
    expect(search.get('outputFormat')).toBe('application/json');
    expect(search.get('srsName')).toBe('EPSG:4326');
    expect(search.get('CQL_FILTER')).toBeNull();
    expect(search.get('count')).toBeNull();
  });

  it('maps paging to count/startIndex', async () => {
    const { fn, calls } = stubFetch(() => emptyCollection);
    await new WfsDataSource(config, fn).query({ page: { offset: 50, limit: 25 } });

    const search = searchOf(calls[0]!.url);
    expect(search.get('count')).toBe('25');
    expect(search.get('startIndex')).toBe('50');
  });

  it('AND-combines baseFilter, user filter, and INTERSECTS into CQL_FILTER', async () => {
    const { fn, calls } = stubFetch(() => emptyCollection);
    const source = new WfsDataSource({ ...config, baseFilter: eq('REGION', 'NE') }, fn);
    await source.query({ filter: like('STATE_NAME', '%New%'), geometry: aoi });

    const search = searchOf(calls[0]!.url);
    expect(search.get('CQL_FILTER')).toBe(
      "(REGION = 'NE' AND STATE_NAME LIKE '%New%') AND " +
      'INTERSECTS(the_geom, POLYGON ((-100 40, -90 40, -90 50, -100 40)))',
    );
  });

  it('uses the configured geometryName', async () => {
    const { fn, calls } = stubFetch(() => emptyCollection);
    const source = new WfsDataSource({ ...config, geometryName: 'geom' }, fn);
    await source.query({ geometry: aoi });

    expect(searchOf(calls[0]!.url).get('CQL_FILTER')).toContain('INTERSECTS(geom,');
  });

  it('rejects filters on fields outside knownFields before any request', async () => {
    const { fn, calls } = stubFetch(() => emptyCollection);
    const source = new WfsDataSource({ ...config, knownFields: ['STATE_NAME'] }, fn);

    await expect(source.query({ filter: eq('GHOST', 1) })).rejects.toThrow('unknown field "GHOST"');
    expect(calls).toHaveLength(0);

    await source.query({ filter: eq('STATE_NAME', 'Maine') }); // known field passes
    expect(calls).toHaveLength(1);
  });
});

describe('WfsDataSource.query — response parsing', () => {
  it('maps features and reads total from numberMatched', async () => {
    const { fn } = stubFetch(() => ({
      features: [
        { id: 'states.1', properties: { STATE_NAME: 'Maine' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
      numberMatched: 52,
    }));
    const result = await new WfsDataSource(config, fn).query({});

    expect(result.total).toBe(52);
    expect(result.features).toEqual([
      {
        id: 'states.1',
        properties: { STATE_NAME: 'Maine' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]);
  });

  it('falls back to properties[idField] when the feature has no id', async () => {
    const { fn } = stubFetch(() => ({
      features: [{ properties: { STATE_FIPS: 23, STATE_NAME: 'Maine' } }],
    }));
    const result = await new WfsDataSource(config, fn).query({});
    expect(result.features[0]!.id).toBe('23');
  });

  it("total: numberMatched 'unknown' → totalFeatures → page-shape fallback", async () => {
    const mk = (body: object) => stubFetch(() => body).fn;

    expect((await new WfsDataSource(config, mk({
      features: [{}], numberMatched: 'unknown', totalFeatures: 52,
    })).query({})).total).toBe(52);

    // Partial page (2 of limit 5): the total is exact.
    expect((await new WfsDataSource(config, mk({
      features: [{}, {}], numberMatched: 'unknown',
    })).query({ page: { offset: 10, limit: 5 } })).total).toBe(12);

    // FULL page: at least one more may exist — total reports one extra so
    // the pager keeps "Next" enabled.
    expect((await new WfsDataSource(config, mk({
      features: [{}, {}], numberMatched: 'unknown',
    })).query({ page: { offset: 10, limit: 2 } })).total).toBe(13);

    // No paging requested: everything came back — exact.
    expect((await new WfsDataSource(config, mk({
      features: [{}, {}],
    })).query({})).total).toBe(2);
  });

  it('throws on non-OK responses', async () => {
    const fn = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(new WfsDataSource(config, fn).query({})).rejects.toThrow('HTTP 503');
  });
});

describe('WfsDataSource.getById', () => {
  it('queries by featureID without CQL', async () => {
    const { fn, calls } = stubFetch(() => ({
      features: [{ id: 'states.7', properties: {} }],
    }));
    const source = new WfsDataSource({ ...config, baseFilter: eq('A', 1) }, fn);
    const feature = await source.getById('states.7');

    const search = searchOf(calls[0]!.url);
    expect(search.get('featureID')).toBe('states.7');
    expect(search.get('CQL_FILTER')).toBeNull();
    expect(feature?.id).toBe('states.7');
  });

  it('returns undefined when nothing matches', async () => {
    const { fn } = stubFetch(() => ({ features: [] }));
    expect(await new WfsDataSource(config, fn).getById('nope')).toBeUndefined();
  });
});

describe('geojsonToWkt', () => {
  it('converts Point', () => {
    expect(geojsonToWkt({ type: 'Point', coordinates: [-96, 56] })).toBe('POINT (-96 56)');
  });

  it('converts Polygon with a hole', () => {
    expect(geojsonToWkt({
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 0]],
        [[1, 1], [2, 1], [2, 2], [1, 1]],
      ],
    })).toBe('POLYGON ((0 0, 10 0, 10 10, 0 0), (1 1, 2 1, 2 2, 1 1))');
  });

  it('converts MultiPolygon', () => {
    expect(geojsonToWkt({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]]],
      ],
    })).toBe('MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))');
  });

  it('throws on unsupported types', () => {
    expect(() => geojsonToWkt({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }))
      .toThrow('unsupported geometry type');
  });
});
