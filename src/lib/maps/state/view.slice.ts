import type { PayloadAction, Reducer } from '../../core/redux/index.ts';

/** The shareable map view: where the map is centred and how far it's zoomed. */
export interface ViewState {
  /** Center as lon/lat (EPSG:4326). */
  center: [number, number];
  zoom: number;
}

export type ViewAction = PayloadAction<'view/changed', ViewState>;

export const viewChanged = (center: [number, number], zoom: number): ViewAction =>
  ({ type: 'view/changed', payload: { center, zoom } });

/**
 * The map view as plain, serializable state (ADR-2). The map is the live view;
 * this slice mirrors it (updated on `moveend`) so the view is part of the
 * shareable/persistable tree. The AppMap binder applies programmatic changes
 * (e.g. share restore) back onto the native view. Placeholder initial value —
 * the composition root seeds it from config or a share link at startup.
 */
export const viewReducer: Reducer<ViewState, ViewAction> = (
  state = { center: [0, 0], zoom: 0 },
  action,
) => {
  if (action.type === 'view/changed') {
    const { center, zoom } = action.payload;
    if (state.center[0] === center[0] && state.center[1] === center[1] && state.zoom === zoom) {
      return state;
    }
    return { center: [center[0], center[1]], zoom };
  }
  return state;
};
