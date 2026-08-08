import Draw from 'ol/interaction/Draw.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import GeoJSONFormat from 'ol/format/GeoJSON.js';
import type { Polygon } from 'geojson';
import type { OLMap } from './openLayers.ts';

/** A single polygon draw. Resolves with 4326 GeoJSON, or `null` when cancelled. */
export interface DrawSession {
  finished: Promise<Polygon | null>;
  cancel(): void;
}

/**
 * Starts drawing one polygon on a throwaway source/layer. On `drawend` the
 * interaction and sketch layer are removed and `finished` resolves with the
 * polygon converted to EPSG:4326 GeoJSON. `cancel()` removes the interaction
 * and resolves `null`. Session exclusivity is enforced by the AppMap caller.
 */
export function startPolygonDraw(map: OLMap): DrawSession {
  const source = new VectorSource();
  const layer = new VectorLayer({ source });
  const draw = new Draw({ source, type: 'Polygon' });
  map.addLayer(layer);
  map.addInteraction(draw);

  let settle!: (polygon: Polygon | null) => void;
  let settled = false;
  const finished = new Promise<Polygon | null>(resolve => { settle = resolve; });

  const finish = (polygon: Polygon | null): void => {
    if (settled) return;
    settled = true;
    map.removeInteraction(draw);
    map.removeLayer(layer);
    settle(polygon);
  };

  draw.on('drawend', event => {
    const geometry = event.feature.getGeometry();
    if (!geometry) {
      finish(null);
      return;
    }
    const format = new GeoJSONFormat({
      featureProjection: map.getView().getProjection(),
      dataProjection: 'EPSG:4326',
    });
    finish(format.writeGeometryObject(geometry) as Polygon);
  });

  return {
    finished,
    cancel: () => finish(null),
  };
}
