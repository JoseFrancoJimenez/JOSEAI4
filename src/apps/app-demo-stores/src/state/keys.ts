/**
 * Every key across every slice is globally unique. This is the load-bearing decision that
 * makes the two wirings possible: it means a single store's state is literally the union of the
 * domain slices below, so one facade type (see facade.ts) can describe both the three-domain-
 * stores wiring and the single-AppStore wiring without any per-wiring branching.
 */

export interface LayerState {
  id: string;
  visible: boolean;
}

export interface LayersSlice {
  layersById: Record<string, LayerState>;
  layerOrder: string[];
  /** layer id -> active variable id */
  variableByLayerId: Record<string, string>;
}

export interface UiSlice {
  /** TOC group ids currently expanded */
  expandedIds: string[];
  /** legend sections currently open */
  expandedLegendIds: string[];
  tableLayerId: string | null;
  tablePage: number;
}

export interface ViewportSlice {
  center: [number, number];
  zoom: number;
}

export type AppState = LayersSlice & UiSlice & ViewportSlice;
