import 'ol/ol.css';
import OLMap from 'ol/Map.js';
import View from 'ol/View.js';
import { fromLonLat } from 'ol/proj.js';
import type OLBaseLayer from 'ol/layer/Base.js';
import type { Extent } from 'ol/extent.js';

export type { OLMap, OLBaseLayer };

/** Construction options for an AppMap instance. */
export interface MapConfig {
  /** DOM element or element ID to render the map into. */
  target: string | HTMLElement;
  /** Initial map center as lon/lat (EPSG:4326); converted to the view projection here. */
  center: [number, number];
  /** Initial zoom level. */
  zoom: number;
  /** EPSG code for the map projection. Defaults to `'EPSG:3857'`. */
  projection?: string;
  /** Hard pan boundary for the view extent. */
  extent?: Extent;
  /** When true, only the center point is constrained to the extent (not the full view). */
  constrainOnlyCenter?: boolean;
  /** Minimum allowed zoom level. */
  minZoom?: number;
  /** Maximum allowed zoom level. */
  maxZoom?: number;
}

/** Creates an OL Map with a configured View from a {@link MapConfig}. */
export function createMap(config: MapConfig): OLMap {
  return new OLMap({
    target: config.target,
    view: new View({
      projection: config.projection ?? 'EPSG:3857',
      center: fromLonLat(config.center, config.projection ?? 'EPSG:3857'),
      zoom: config.zoom,
      extent: config.extent,
      constrainOnlyCenter: config.constrainOnlyCenter,
      minZoom: config.minZoom,
      maxZoom: config.maxZoom,
    }),
  });
}

/**
 * Converts our renderer array to an OL FlatStyleLike value.
 *
 * OL supports two array forms:
 *  - FlatStyle[]  — plain style objects applied to every feature
 *  - Rule[]       — { filter?, else?, style } objects for conditional rendering
 *
 * filter/else/style are only honoured on Rule objects, not on FlatStyle objects.
 * So when any renderer item carries filter, else, or a nested style, we emit
 * Rule[] so OL evaluates conditions correctly.
 */
export function toOLStyle(renderer: unknown[]): unknown[] {
  const needsRules = renderer.some(r =>
    typeof r === 'object' && r !== null &&
    ('filter' in (r as object) || 'style' in (r as object) || 'else' in (r as object))
  );

  if (!needsRules) return renderer;

  return renderer.map(rule => {
    if (typeof rule !== 'object' || rule === null) return rule;
    const r = rule as Record<string, unknown>;

    if ('style' in r) {
      const { filter, style, else: isElse } = r as { filter?: unknown; style: unknown; else?: boolean };
      const out: Record<string, unknown> = { style };
      if (filter !== undefined) out['filter'] = filter;
      if (isElse) out['else'] = true;
      return out;
    }

    const { filter, ...styleProps } = r as { filter?: unknown; [k: string]: unknown };
    return filter !== undefined ? { filter, style: styleProps } : { style: r };
  });
}
