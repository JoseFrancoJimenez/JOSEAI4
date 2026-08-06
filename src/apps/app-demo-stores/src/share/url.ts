import type { LayerConfig } from "../config/types.ts";
import type { ShareState } from "../state/selectors.ts";

/**
 * Share-link params are readable and versioned, not opaque base64 — this is a debugging app:
 * `?v=1&vis=a,b&exp=group:base-maps&leg=a&var=a:tier,b:province&tl=points&tp=3&c=-71.21,46.81&z=8`
 *
 * `encodeShareState`/`decodeShareState` are pure — no store or DOM access. Decoding is **total**:
 * unknown layer ids are dropped, malformed numbers are ignored, missing params are omitted, and a
 * wrong/future version is ignored entirely — it never throws, always returning a partial to merge
 * over config-seeded defaults.
 *
 * Deviation from the task brief, flagged: the brief types `decodeShareState` as returning
 * `Partial<AppState>`, but `AppState`'s `layersById`/`layerOrder` (the full per-layer record and
 * order) can't be reconstructed from a URL's `vis` id list without the full config list to know
 * every layer's id and default order — and validating `vis`/`var` against "the layer actually has
 * this variable" (an explicit test requirement) needs that same config list. So this returns
 * `Partial<ShareState>` (the selectors' own read shape — `visibleIds`, not `layersById`) and
 * takes `configs` to validate against; turning `visibleIds` into a `layersById` override is the
 * composition root's job (Task 26), which already has the configs on hand.
 */

const SHARE_VERSION = 1;
const CENTER_PRECISION = 4;
const ZOOM_PRECISION = 2;

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

export function encodeShareState(state: ShareState): string {
  const params = new URLSearchParams();
  params.set("v", String(SHARE_VERSION));
  if (state.visibleIds.length > 0) params.set("vis", state.visibleIds.join(","));
  if (state.expandedIds.length > 0) params.set("exp", state.expandedIds.join(","));
  if (state.expandedLegendIds.length > 0) params.set("leg", state.expandedLegendIds.join(","));

  const variablePairs = Object.entries(state.variableByLayerId);
  if (variablePairs.length > 0) {
    params.set("var", variablePairs.map(([layerId, variableId]) => `${layerId}:${variableId}`).join(","));
  }

  if (state.tableLayerId !== null) params.set("tl", state.tableLayerId);
  params.set("tp", String(state.tablePage));
  params.set("c", `${round(state.center[0], CENTER_PRECISION)},${round(state.center[1], CENTER_PRECISION)}`);
  params.set("z", String(round(state.zoom, ZOOM_PRECISION)));

  return params.toString();
}

export function decodeShareState(search: string, configs: LayerConfig[]): Partial<ShareState> {
  const params = new URLSearchParams(search);
  if (params.get("v") !== String(SHARE_VERSION)) return {};

  const layerIds = new Set(configs.map((c) => c.id));
  return {
    ...decodeIdLists(params, layerIds),
    ...decodeVariables(params, configs),
    ...decodeTable(params, layerIds),
    ...decodeViewport(params),
  };
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter((id) => id.length > 0);
}

function decodeIdLists(params: URLSearchParams, layerIds: Set<string>): Partial<ShareState> {
  const result: Partial<ShareState> = {};
  const vis = parseList(params.get("vis")).filter((id) => layerIds.has(id));
  if (vis.length > 0) result.visibleIds = vis;

  // Group ids (exp/leg) are namespaced ("group:<slug>") and validated for staleness downstream
  // (buildTreeDefs only stamps expanded:true for groups it actually derives) — not here.
  const exp = parseList(params.get("exp"));
  if (exp.length > 0) result.expandedIds = exp;
  const leg = parseList(params.get("leg"));
  if (leg.length > 0) result.expandedLegendIds = leg;

  return result;
}

function decodeVariables(params: URLSearchParams, configs: LayerConfig[]): Partial<ShareState> {
  const pairs = parseList(params.get("var"))
    .map((entry) => entry.split(":"))
    .filter((parts): parts is [string, string] => parts.length === 2)
    .filter(([layerId, variableId]) => {
      const config = configs.find((c) => c.id === layerId);
      return config !== undefined && config.variables.some((v) => v.id === variableId);
    });

  return pairs.length > 0 ? { variableByLayerId: Object.fromEntries(pairs) } : {};
}

function decodeTable(params: URLSearchParams, layerIds: Set<string>): Partial<ShareState> {
  const result: Partial<ShareState> = {};
  const tl = params.get("tl");
  if (tl !== null && layerIds.has(tl)) result.tableLayerId = tl;

  const tp = Number(params.get("tp"));
  if (params.get("tp") !== null && Number.isFinite(tp) && Number.isInteger(tp) && tp > 0) result.tablePage = tp;

  return result;
}

function decodeViewport(params: URLSearchParams): Partial<ShareState> {
  const result: Partial<ShareState> = {};

  const centerParts = (params.get("c") ?? "").split(",").map(Number);
  if (centerParts.length === 2 && centerParts.every((n) => Number.isFinite(n))) {
    result.center = [centerParts[0]!, centerParts[1]!];
  }

  const z = Number(params.get("z"));
  if (params.get("z") !== null && Number.isFinite(z)) result.zoom = z;

  return result;
}
