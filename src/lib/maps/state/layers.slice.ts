import type { PayloadAction, Reducer } from '../../core/redux/index.ts';

/** Runtime state of one layer (ADR-3): serializable, no OL objects. */
export interface LayerRuntimeState {
  visible: boolean;
  opacity: number;
  variableId?: string;
}

export interface LayersState {
  byId: Record<string, LayerRuntimeState>;
}

export type LayersAction =
  | PayloadAction<'layers/registered', { id: string; initial: LayerRuntimeState }>
  | PayloadAction<'layers/unregistered', { id: string }>
  | PayloadAction<'layers/visibilitySet', { id: string; visible: boolean }>
  | PayloadAction<'layers/opacitySet', { id: string; opacity: number }>
  | PayloadAction<'layers/variableSet', { id: string; variableId: string | undefined }>
  | PayloadAction<'layers/hydrated', { byId: Record<string, Partial<LayerRuntimeState>> }>;

export const layerRegistered = (id: string, initial: LayerRuntimeState): LayersAction =>
  ({ type: 'layers/registered', payload: { id, initial } });
export const layerUnregistered = (id: string): LayersAction =>
  ({ type: 'layers/unregistered', payload: { id } });
export const layerVisibilitySet = (id: string, visible: boolean): LayersAction =>
  ({ type: 'layers/visibilitySet', payload: { id, visible } });
export const layerOpacitySet = (id: string, opacity: number): LayersAction =>
  ({ type: 'layers/opacitySet', payload: { id, opacity } });
export const layerVariableSet = (id: string, variableId: string | undefined): LayersAction =>
  ({ type: 'layers/variableSet', payload: { id, variableId } });
export const layersHydrated = (byId: Record<string, Partial<LayerRuntimeState>>): LayersAction =>
  ({ type: 'layers/hydrated', payload: { byId } });

const clampOpacity = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Narrows an untrusted `byId`-shaped value (parsed JSON, URL payload) to
 * validated partial records for {@link layersHydrated}. Unknown record keys
 * and wrongly-typed values are dropped; opacity is clamped to [0, 1]. Returns
 * `null` when the value is not a record at all.
 */
export function sanitizeLayerRecords(byId: unknown): Record<string, Partial<LayerRuntimeState>> | null {
  if (typeof byId !== 'object' || byId === null || Array.isArray(byId)) return null;

  const result: Record<string, Partial<LayerRuntimeState>> = {};
  for (const [id, record] of Object.entries(byId as Record<string, unknown>)) {
    if (typeof record !== 'object' || record === null) continue;
    const { visible, opacity, variableId } = record as Partial<LayerRuntimeState>;
    const partial: Partial<LayerRuntimeState> = {};
    if (typeof visible === 'boolean') partial.visible = visible;
    if (typeof opacity === 'number') partial.opacity = clampOpacity(opacity);
    if (typeof variableId === 'string') partial.variableId = variableId;
    result[id] = partial;
  }
  return result;
}

/**
 * Parses a serialized layers snapshot (`JSON.stringify(state.layers)`) into a
 * validated partial-record map for {@link layersHydrated}. Returns `null`
 * when the JSON has no usable `byId` object.
 */
export function parseLayersSnapshot(json: string): Record<string, Partial<LayerRuntimeState>> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  return sanitizeLayerRecords((parsed as { byId?: unknown }).byId);
}

/**
 * Merges `partial` into the record for `id` — immutably: new `byId`, new inner
 * record. Returns the SAME state when `id` is unknown or every provided key is
 * already identical, so subscribers can rely on reference equality.
 */
function updateRecord(
  state: LayersState,
  id: string,
  partial: Partial<LayerRuntimeState>,
): LayersState {
  const current = state.byId[id];
  if (!current) return state;
  const keys = Object.keys(partial) as (keyof LayerRuntimeState)[];
  if (keys.every(key => current[key] === partial[key])) return state;
  return { byId: { ...state.byId, [id]: { ...current, ...partial } } };
}

/**
 * Single source of truth for layer runtime state (`visible`/`opacity`/
 * `variableId`). `AppLayer` reads/dispatches here; the binder inside `AppMap`
 * is the only place that applies this state to native OL layers (ground rule 4).
 */
export const layersReducer: Reducer<LayersState, LayersAction> = (
  state = { byId: {} },
  action,
) => {
  switch (action.type) {
    case 'layers/registered': {
      const { id, initial } = action.payload;
      if (state.byId[id]) return state;
      return { byId: { ...state.byId, [id]: { ...initial } } };
    }
    case 'layers/unregistered': {
      const { id } = action.payload;
      if (!state.byId[id]) return state;
      const byId = { ...state.byId };
      delete byId[id];
      return { byId };
    }
    case 'layers/visibilitySet':
      return updateRecord(state, action.payload.id, { visible: action.payload.visible });
    case 'layers/opacitySet':
      return updateRecord(state, action.payload.id, { opacity: clampOpacity(action.payload.opacity) });
    case 'layers/variableSet':
      return updateRecord(state, action.payload.id, { variableId: action.payload.variableId });
    case 'layers/hydrated': {
      let next = state;
      for (const [id, partial] of Object.entries(action.payload.byId)) {
        next = updateRecord(next, id, partial);
      }
      return next;
    }
    default:
      return state;
  }
};
