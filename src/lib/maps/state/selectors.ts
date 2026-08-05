/**
 * Read helpers over the {@link GisState} tree.
 *
 * `store.getState()` returns a `DeepReadonly` view, but consumer contracts
 * (QueryParams, overlay positions) use plain types. State is immutable by the
 * redux core's contract, so reading it back as the plain type is safe — and
 * the casts doing so live HERE and nowhere else. Consumers must treat every
 * selected value as read-only data.
 */

import type { Polygon } from 'geojson';
import type { DeepReadonly } from '../../core/redux/index.ts';
import type { GisState } from './gisStore.ts';
import type { LayerRuntimeState } from './layers.slice.ts';
import type { Selection } from './selection.slice.ts';
import type { MapTool } from './tool.slice.ts';
import type { ViewState } from './view.slice.ts';
import type { FilterNode } from '../data/filter/ast.ts';

/** What selectors receive: the state as handed out by `getState()`. */
export type GisReadonlyState = DeepReadonly<GisState>;

export const selectLayersById = (
  state: GisReadonlyState,
): Readonly<Record<string, LayerRuntimeState>> => state.layers.byId;

export const selectLayerState = (
  state: GisReadonlyState,
  id: string,
): LayerRuntimeState | undefined => state.layers.byId[id];

export const selectSelection = (state: GisReadonlyState): Selection | null =>
  state.selection.selection as Selection | null;

export const selectFilterForLayer = (
  state: GisReadonlyState,
  layerId: string,
): FilterNode | undefined => state.filter.byLayer[layerId] as FilterNode | undefined;

export const selectFilters = (
  state: GisReadonlyState,
): Readonly<Record<string, FilterNode>> =>
  state.filter.byLayer as Readonly<Record<string, FilterNode>>;

export const selectAoiGeometry = (state: GisReadonlyState): Polygon | null =>
  state.aoi.geometry as Polygon | null;

export const selectActiveTool = (state: GisReadonlyState): MapTool => state.tool.active;

export const selectView = (state: GisReadonlyState): ViewState => ({
  center: [state.view.center[0], state.view.center[1]],
  zoom: state.view.zoom,
});

/** Layers snapshot for persistence — the input `parseLayersSnapshot` accepts back. */
export const serializeLayers = (state: GisReadonlyState): string =>
  JSON.stringify(state.layers);
