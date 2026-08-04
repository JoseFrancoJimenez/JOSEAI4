import OLVectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import EsriJSON from 'ol/format/EsriJSON.js';
import { bbox } from 'ol/loadingstrategy.js';

import provincesConfig from '../testData/layers/provinces.json';
import pointsConfig from '../testData/layers/points.json';
import airportsConfig from '../testData/layers/airports.json';

const ESRI_WEB_MERCATOR_WKID = 102100;

/**
 * Builds the three OpenLayers layers this app renders, bottom-to-top: provinces
 * (polygons) → sample points → airports. Each layer carries its config `id` as
 * an OL property so {@link AppMap} can register it. Styling/visibility are not
 * set here — those come from the AppLayer state wired to each layer.
 */
export function createAppLayers(): OLVectorLayer[] {
  return [createProvincesLayer(), createPointsLayer(), createAirportsLayer()];
}

/** Canada provinces, from local GeoJSON. */
export function createProvincesLayer(): OLVectorLayer {
  return new OLVectorLayer({
    properties: { id: provincesConfig.id },
    source: new VectorSource({ url: provincesConfig.source.url, format: new GeoJSON() }),
  });
}

/** Sample city points, from local GeoJSON. */
export function createPointsLayer(): OLVectorLayer {
  return new OLVectorLayer({
    properties: { id: pointsConfig.id },
    source: new VectorSource({ url: pointsConfig.source.url, format: new GeoJSON() }),
  });
}

/** Canadian airports, streamed from a remote Esri MapServer with a bbox strategy. */
export function createAirportsLayer(): OLVectorLayer {
  return new OLVectorLayer({
    properties: { id: airportsConfig.id },
    source: createEsriJSONSource(airportsConfig.source.url),
  });
}

function createEsriJSONSource(url: string): VectorSource {
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
      return `${url}/query?${params}`;
    },
  });
}
