/** One field exposed by a layer for the table. State holds only `{ id, visible }`; everything
 * else (labels, fields, legends) is resolved through these configs by id. */
export interface LayerField {
  id: string;
  label: string;
}

export interface LegendItem {
  label: string;
  color?: string;
  symbol?: string;
}

export interface VariableLegend {
  label?: string;
  items: LegendItem[];
}

/** A named rendering mode for a layer (e.g. "by tier", "by population"). `renderer` is opaque
 * here — it is only ever handed to the OL styling path, never interpreted by config code. */
export interface LayerVariable {
  id: string;
  renderer: unknown[];
  legend?: VariableLegend;
}

export type VectorSourceType = "geojson" | "esrijson";

export interface VectorSourceConfig {
  type: VectorSourceType;
  url: string;
}

/**
 * The only implemented layer kind. `type` is the discriminant so the loader can recognize and
 * skip unsupported kinds (wfs, tile) — out of scope for this plan — with a warning instead of a
 * crash. `LayerConfig` stays a union of one until a second kind is implemented.
 */
export interface VectorLayerConfig {
  type: "vector";
  id: string;
  label: string;
  /** Additive to the operator's config format; drives TOC grouping only. Nothing else reads it. */
  category?: string;
  source: VectorSourceConfig;
  visible: boolean;
  fields: LayerField[];
  default_variable: string;
  variables: LayerVariable[];
}

export type LayerConfig = VectorLayerConfig;
