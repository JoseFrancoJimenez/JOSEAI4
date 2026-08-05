import type { Polygon } from 'geojson';
import type { Action, PayloadAction, Reducer } from '../../core/redux/index.ts';

export interface AoiState {
  /** Area of interest, GeoJSON in EPSG:4326. */
  geometry: Polygon | null;
}

export type AoiAction =
  | PayloadAction<'aoi/geometrySet', { geometry: Polygon }>
  | Action<'aoi/cleared'>;

export const aoiGeometrySet = (geometry: Polygon): AoiAction =>
  ({ type: 'aoi/geometrySet', payload: { geometry } });
export const aoiCleared = (): AoiAction => ({ type: 'aoi/cleared' });

/** The drawn area-of-interest constraint shared by AOI widget → table (ADR-2). */
export const aoiReducer: Reducer<AoiState, AoiAction> = (
  state = { geometry: null },
  action,
) => {
  switch (action.type) {
    case 'aoi/geometrySet':
      return state.geometry === action.payload.geometry ? state : { geometry: action.payload.geometry };
    case 'aoi/cleared':
      return state.geometry === null ? state : { geometry: null };
    default:
      return state;
  }
};
