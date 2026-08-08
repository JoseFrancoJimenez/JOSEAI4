/**
 * The app-domain context keys (see `src/lib/components/context.ts` for the
 * mechanism). The composition root provides these; widget elements fall back
 * to them for any dependency not set as a property.
 */

import { createContext, type ContextKey } from '../components/context.ts';
import type { GisStore } from './state/gisStore.ts';
import type { AppMap } from './openLayers/appMap.ts';
import type { DataSourceRegistry } from './data/dataSourceFactory.ts';

export const storeContext: ContextKey<GisStore> = createContext('gis:store');
export const appMapContext: ContextKey<AppMap> = createContext('gis:app-map');
export const dataSourceRegistryContext: ContextKey<DataSourceRegistry> =
  createContext('gis:data-source-registry');
