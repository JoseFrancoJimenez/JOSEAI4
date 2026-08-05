import OLVectorLayer from 'ol/layer/Vector.js';
import OLImageLayer from 'ol/layer/Image.js';
import OLTileLayer from 'ol/layer/Tile.js';
import VectorSource from 'ol/source/Vector.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import TileArcGISRest from 'ol/source/TileArcGISRest.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import EsriJSON from 'ol/format/EsriJSON.js';
import { bbox } from 'ol/loadingstrategy.js';
import type OLBaseLayer from 'ol/layer/Base.js';

import type { LayerConfig, VectorLayerConfig, ImageLayerConfig, TileLayerConfig, VectorSourceConfig, WFSSourceConfig, EsriJSONSourceConfig, WfsBackendSourceConfig, ArcGisBackendSourceConfig } from '../../layers/types.ts';
// Sanctioned exception (ground rule 1): layerFactory may import the filter
// compilers to build display-load URLs.
import { toCql } from '../../data/filter/toCql.ts';
import { toEsriWhere } from '../../data/filter/toEsriWhere.ts';
import type { FilterNode } from '../../data/filter/ast.ts';

const ESRI_WEB_MERCATOR_WKID = 102100;

/** Creates the native OL layer that corresponds to the given layer config. */
export function createNativeLayer(config: LayerConfig): OLBaseLayer {
  switch (config.type) {
    case 'vector': return createNativeVectorLayer(config);
    case 'image':  return createNativeImageLayer(config);
    case 'tile':   return createNativeTileLayer(config);
  }
}

function createNativeVectorLayer(config: VectorLayerConfig): OLVectorLayer {
  return new OLVectorLayer({ source: createVectorSource(config.source, config.baseFilter) });
}

function createNativeImageLayer(config: ImageLayerConfig): OLImageLayer<ImageWMS> {
  return new OLImageLayer({
    source: new ImageWMS({ url: config.source.url, params: config.source.params }),
  });
}

function createNativeTileLayer(config: TileLayerConfig): OLTileLayer {
  return new OLTileLayer({ source: new TileArcGISRest({ url: config.source.url }) });
}

function createVectorSource(source: VectorSourceConfig, baseFilter?: FilterNode): VectorSource {
  if ('kind' in source) {
    // Data-backend sources: both demo layers are small, so load all features
    // once. Requested in EPSG:4326 — the format transforms to the view
    // projection, and Esri geojson carries no crs member to trust anyway.
    return source.kind === 'wfs'
      ? createWfsBackendSource(source, baseFilter)
      : createArcGisBackendSource(source, baseFilter);
  }
  switch (source.type) {
    case 'geojson':  return new VectorSource({ url: source.url, format: new GeoJSON() });
    case 'esrijson': return createEsriJSONSource(source);
    case 'wfs':      return createWFSSource(source);
  }
}

function createWfsBackendSource(source: WfsBackendSourceConfig, baseFilter?: FilterNode): VectorSource {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: source.typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  if (baseFilter) params.set('CQL_FILTER', toCql(baseFilter));
  return new VectorSource({ url: `${source.url}?${params}`, format: new GeoJSON() });
}

function createArcGisBackendSource(source: ArcGisBackendSourceConfig, baseFilter?: FilterNode): VectorSource {
  const params = new URLSearchParams({
    where: baseFilter ? toEsriWhere(baseFilter) : '1=1',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  return new VectorSource({ url: `${source.url}/query?${params}`, format: new GeoJSON() });
}

function createWFSSource(source: WFSSourceConfig): VectorSource {
  return new VectorSource({
    format: new GeoJSON(),
    strategy: bbox,
    url: (extent, _resolution, projection) => {
      const params = new URLSearchParams({
        service: 'WFS',
        version: source.version ?? '2.0.0',
        request: 'GetFeature',
        typeName: source.typeName,
        outputFormat: 'application/json',
        srsname: projection.getCode(),
        bbox: `${extent.join(',')},${projection.getCode()}`,
      });
      return `${source.url}?${params}`;
    },
  });
}

function createEsriJSONSource(source: EsriJSONSourceConfig): VectorSource {
  return new VectorSource({
    format: new EsriJSON(),
    strategy: bbox,
    url: (extent) => {
      const params = new URLSearchParams({
        f: 'json',
        returnGeometry: 'true',
        spatialRel: 'esriSpatialRelIntersects',
        geometry: JSON.stringify({
          xmin: extent[0], ymin: extent[1],
          xmax: extent[2], ymax: extent[3],
          spatialReference: { wkid: ESRI_WEB_MERCATOR_WKID },
        }),
        geometryType: 'esriGeometryEnvelope',
        inSR: String(ESRI_WEB_MERCATOR_WKID),
        outFields: '*',
        outSR: String(ESRI_WEB_MERCATOR_WKID),
      });
      return `${source.url}/query?${params}`;
    },
  });
}
