import type { PayloadAction, Reducer } from '../../core/redux/index.ts';
import type { FilterNode } from '../data/filter/ast.ts';

export interface FilterState {
  byLayer: Record<string, FilterNode>;
}

export type FilterAction =
  | PayloadAction<'filter/set', { layerId: string; node: FilterNode }>
  | PayloadAction<'filter/cleared', { layerId: string }>;

export const filterSet = (layerId: string, node: FilterNode): FilterAction =>
  ({ type: 'filter/set', payload: { layerId, node } });
export const filterCleared = (layerId: string): FilterAction =>
  ({ type: 'filter/cleared', payload: { layerId } });

/** Per-layer user filters (neutral AST — never compiled strings). */
export const filterReducer: Reducer<FilterState, FilterAction> = (
  state = { byLayer: {} },
  action,
) => {
  switch (action.type) {
    case 'filter/set': {
      const { layerId, node } = action.payload;
      if (state.byLayer[layerId] === node) return state;
      return { byLayer: { ...state.byLayer, [layerId]: node } };
    }
    case 'filter/cleared': {
      const { layerId } = action.payload;
      if (!(layerId in state.byLayer)) return state;
      const byLayer = { ...state.byLayer };
      delete byLayer[layerId];
      return { byLayer };
    }
    default:
      return state;
  }
};
