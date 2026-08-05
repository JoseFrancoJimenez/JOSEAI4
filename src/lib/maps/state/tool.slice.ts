import type { PayloadAction, Reducer } from '../../core/redux/index.ts';

export type MapTool = 'identify' | 'aoi-draw';

export interface ToolState {
  active: MapTool;
}

export type ToolAction = PayloadAction<'tool/activated', { tool: MapTool }>;

export const toolActivated = (tool: MapTool): ToolAction =>
  ({ type: 'tool/activated', payload: { tool } });

/** The single active map tool (ADR-5): identify clicks are ignored while another tool runs. */
export const toolReducer: Reducer<ToolState, ToolAction> = (
  state = { active: 'identify' },
  action,
) => {
  if (action.type === 'tool/activated') {
    return state.active === action.payload.tool ? state : { active: action.payload.tool };
  }
  return state;
};
