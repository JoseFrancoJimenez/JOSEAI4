import type { FilterNode } from '../data/filter/ast.ts';

export interface FieldConfig {
  id: string;
  label: string;
  /** Value type; the filter widget coerces input to number for numeric fields. */
  type?: 'string' | 'number';
  /** Show as a data-table column. */
  inTable?: boolean;
  /** Show in the identify popup. */
  inPopup?: boolean;
  /** Offer in the filter widget. */
  filterable?: boolean;
}

export interface LegendItem {
  label: string;
  color?: string;
  symbol?: string;
}

export interface Legend {
  label: string;
  subLabel: string;
  items: LegendItem[];
}

export interface VariableConfig {
  id: string;
  renderer: unknown[];
  legend?: Partial<Legend>;
}

export interface BaseLayerConfig {
  id: string;
  label: string;
  visible?: boolean;
  opacity?: number;
  legend?: Partial<Legend>;
  /** Property that uniquely identifies a feature (fallback when the format carries no id). */
  idField?: string;
  /** Neutral filter AND-combined into every data query and display load. */
  baseFilter?: FilterNode;
}

// ── Vector source configs ────────────────────────────────────────────────────

export interface GeoJSONSourceConfig {
  type: 'geojson';
  url: string;
}

export interface EsriJSONSourceConfig {
  type: 'esrijson';
  url: string;
}

export interface WFSSourceConfig {
  type: 'wfs';
  url: string;
  typeName: string;
  version?: string;
}

// ── Data-backend source configs (ADR-4: queryable via createDataSource) ──────

export interface WfsBackendSourceConfig {
  kind: 'wfs';
  url: string;
  typeName: string;
  /** Geometry attribute for spatial CQL. Default `'the_geom'`. */
  geometryName?: string;
}

export interface ArcGisBackendSourceConfig {
  kind: 'arcgis';
  /** Layer endpoint: `…/FeatureServer/0` or `…/MapServer/0`. */
  url: string;
}

export type BackendSourceConfig = WfsBackendSourceConfig | ArcGisBackendSourceConfig;

export type VectorSourceConfig =
  | GeoJSONSourceConfig
  | EsriJSONSourceConfig
  | WFSSourceConfig
  | BackendSourceConfig;

// ── Tile source configs ──────────────────────────────────────────────────────

export interface ArcGISTileSourceConfig {
  type: 'arcgis_tile';
  url: string;
}

export type TileSourceConfig = ArcGISTileSourceConfig;

// ── Image source configs ─────────────────────────────────────────────────────

export interface WmsParams {
  LAYERS: string;
  STYLES?: string;
  FORMAT?: string;
  TRANSPARENT?: boolean;
}

export interface WMSSourceConfig {
  type: 'wms';
  url: string;
  params: WmsParams;
}

export type ImageSourceConfig = WMSSourceConfig;

// ── Layer configs ────────────────────────────────────────────────────────────

export interface VectorLayerConfig extends BaseLayerConfig {
  type: 'vector';
  source: VectorSourceConfig;
  fields: FieldConfig[];
  default_variable?: string;
  variables?: VariableConfig[];
}

export interface ImageLayerConfig extends BaseLayerConfig {
  type: 'image';
  source: ImageSourceConfig;
}

export type RendererRule = {
  label?: string;
  filter?: unknown[];
  style?: Record<string, unknown>;
};

export interface TileLayerConfig extends BaseLayerConfig {
  type: 'tile';
  source: TileSourceConfig;
}

export type LayerConfig = VectorLayerConfig | ImageLayerConfig | TileLayerConfig;
