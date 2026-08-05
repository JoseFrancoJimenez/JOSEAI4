import {
  combineReducers,
  createStore,
  type ActionFromReducersMap,
  type Middleware,
  type StateFromReducersMap,
  type Store,
} from '../../core/redux/index.ts';
import { layersReducer } from './layers.slice.ts';
import { selectionReducer } from './selection.slice.ts';
import { filterReducer } from './filter.slice.ts';
import { aoiReducer } from './aoi.slice.ts';
import { toolReducer } from './tool.slice.ts';
import { viewReducer } from './view.slice.ts';

/**
 * The app's single state tree (ADR-2, redux edition): six slices, one store.
 * Both `GisState` and the `GisAction` union are inferred from this map.
 */
export const gisReducers = {
  layers: layersReducer,
  selection: selectionReducer,
  filter: filterReducer,
  aoi: aoiReducer,
  tool: toolReducer,
  view: viewReducer,
};

export const gisRootReducer = combineReducers(gisReducers);

export type GisState = StateFromReducersMap<typeof gisReducers>;
export type GisAction = ActionFromReducersMap<typeof gisReducers>;

/** The store every widget/AppMap dependency is typed as. */
export type GisStore = Store<GisState, GisAction>;

export interface CreateGisStoreOptions {
  preloadedState?: GisState;
  middlewares?: ReadonlyArray<Middleware<GisState, GisAction>>;
  /** Deep-freeze after every reduction (development). */
  freezeState?: boolean;
}

export function createGisStore(options: CreateGisStoreOptions = {}): GisStore {
  return createStore(gisRootReducer, options);
}
