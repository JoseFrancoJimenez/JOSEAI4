import type { Action, PayloadAction, Reducer } from '../../core/redux/index.ts';

export interface Selection {
  layerId: string;
  featureId: string;
  /** Click anchor, lon/lat (EPSG:4326). */
  coordinate: [number, number];
}

export interface SelectionState {
  selection: Selection | null;
}

export type SelectionAction =
  | PayloadAction<'selection/set', { selection: Selection }>
  | Action<'selection/cleared'>;

export const selectionSet = (selection: Selection): SelectionAction =>
  ({ type: 'selection/set', payload: { selection } });
export const selectionCleared = (): SelectionAction => ({ type: 'selection/cleared' });

/** The identified feature shared by map → popup (ADR-2). */
export const selectionReducer: Reducer<SelectionState, SelectionAction> = (
  state = { selection: null },
  action,
) => {
  switch (action.type) {
    case 'selection/set':
      return { selection: action.payload.selection };
    case 'selection/cleared':
      return state.selection === null ? state : { selection: null };
    default:
      return state;
  }
};
