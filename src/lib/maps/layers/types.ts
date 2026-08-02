export interface FieldConfig {
  id: string;
  label: string;
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

export type VectorSourceConfig = GeoJSONSourceConfig | EsriJSONSourceConfig | WFSSourceConfig;

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
