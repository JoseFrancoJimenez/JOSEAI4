/**
 * Shareable map snapshots (permalinks). `buildSharedState` composes the
 * serializable parts of the app — view, layer runtime state, filters, AOI —
 * and `encodeSharedState`/`decodeShareFragment` move it through a URL
 * fragment (`#s=<base64url(JSON)>`).
 *
 * The decode side treats the payload as UNTRUSTED input: every part is
 * shape-validated (filters via `parseFilterNode`, layer records via
 * `sanitizeLayerRecords`, geometry ring-by-ring) and anything malformed is
 * dropped — a bad link degrades to the default app, never a crash.
 */

import type { Polygon, Position } from 'geojson';
import { parseFilterNode, type FilterNode } from '../data/filter/ast.ts';
import type { GisStore } from './gisStore.ts';
import { layersHydrated, sanitizeLayerRecords, type LayerRuntimeState } from './layers.slice.ts';
import { filterSet } from './filter.slice.ts';
import { aoiGeometrySet } from './aoi.slice.ts';
import { viewChanged, type ViewState } from './view.slice.ts';
import {
  selectAoiGeometry,
  selectFilters,
  selectLayersById,
  selectView,
  type GisReadonlyState,
} from './selectors.ts';

/** Everything a share link captures. Selection/tool are transient and excluded. */
export interface SharedMapState {
  view: ViewState;
  layers?: Record<string, Partial<LayerRuntimeState>>;
  filters?: Record<string, FilterNode>;
  aoi?: Polygon;
}

/** Snapshot of the current state tree (view included) as a share payload. */
export function buildSharedState(state: GisReadonlyState): SharedMapState {
  const shared: SharedMapState = { view: selectView(state), layers: { ...selectLayersById(state) } };
  const filters = selectFilters(state);
  if (Object.keys(filters).length > 0) shared.filters = { ...filters };
  const aoi = selectAoiGeometry(state);
  if (aoi) shared.aoi = aoi;
  return shared;
}

/**
 * Restores a decoded share payload into the store through normal actions.
 * Call after the layers are registered — `layersHydrated` patches existing
 * records; unknown ids and unknown record keys are ignored.
 */
export function applySharedState(store: GisStore, shared: SharedMapState): void {
  store.dispatch(viewChanged(shared.view.center, shared.view.zoom));
  if (shared.layers) store.dispatch(layersHydrated(shared.layers));
  for (const [layerId, node] of Object.entries(shared.filters ?? {})) {
    store.dispatch(filterSet(layerId, node));
  }
  if (shared.aoi) store.dispatch(aoiGeometrySet(shared.aoi));
}

/** Encodes a payload as base64url JSON — the value of the `s` fragment param. */
export function encodeSharedState(shared: SharedMapState): string {
  return toBase64Url(JSON.stringify(shared));
}

/**
 * Extracts and validates the `s` param from a URL fragment (`#s=…`). Returns
 * `null` when absent or when the payload has no usable view; invalid layer
 * records, filters, or geometry are dropped individually.
 */
export function decodeShareFragment(hash: string): SharedMapState | null {
  const match = /[#&]s=([A-Za-z0-9_-]+)/.exec(hash);
  if (!match) return null;
  const json = fromBase64Url(match[1]!);
  if (json === null) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;

  const view = parseView((raw as { view?: unknown }).view);
  if (!view) return null;

  const shared: SharedMapState = { view };
  const layers = sanitizeLayerRecords((raw as { layers?: unknown }).layers);
  if (layers) shared.layers = layers;
  const filters = parseFilters((raw as { filters?: unknown }).filters);
  if (filters) shared.filters = filters;
  const aoi = parsePolygon((raw as { aoi?: unknown }).aoi);
  if (aoi) shared.aoi = aoi;
  return shared;
}

function parseView(value: unknown): ViewState | null {
  if (typeof value !== 'object' || value === null) return null;
  const { center, zoom } = value as { center?: unknown; zoom?: unknown };
  if (!Array.isArray(center) || center.length !== 2) return null;
  const [lon, lat] = center;
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat) || !isFiniteNumber(zoom)) return null;
  return { center: [lon, lat], zoom };
}

function parseFilters(value: unknown): Record<string, FilterNode> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const result: Record<string, FilterNode> = {};
  for (const [layerId, raw] of Object.entries(value as Record<string, unknown>)) {
    const node = parseFilterNode(raw);
    if (node) result[layerId] = node;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parsePolygon(value: unknown): Polygon | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { type, coordinates } = value as { type?: unknown; coordinates?: unknown };
  if (type !== 'Polygon' || !Array.isArray(coordinates) || coordinates.length === 0) return undefined;
  const isPosition = (p: unknown): p is Position =>
    Array.isArray(p) && p.length >= 2 && p.every(isFiniteNumber);
  const rings = coordinates as unknown[];
  if (!rings.every(ring => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition))) {
    return undefined;
  }
  return { type: 'Polygon', coordinates: rings as Position[][] };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// URL-safe base64 over UTF-8 JSON. `+/` → `-_`, padding stripped.
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string | null {
  try {
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
