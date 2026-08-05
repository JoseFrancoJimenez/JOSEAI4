import type { LayerConfig, LayerVariable, VectorSourceConfig } from "./types.ts";

/**
 * Layer configs are static JSON pasted into ./layers. Loaded eagerly via import.meta.glob (not
 * a runtime fetch) so loading is synchronous and build-time bundled — simplest option for a
 * fixed set of local files.
 */
const rawModules = import.meta.glob<{ default: unknown }>("./layers/*.json", { eager: true });

function isSourceConfig(x: unknown): x is VectorSourceConfig {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.type === "string" && typeof o.url === "string";
}

function isVectorLayerConfig(x: unknown): x is LayerConfig {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.type === "vector" &&
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.visible === "boolean" &&
    typeof o.default_variable === "string" &&
    Array.isArray(o.fields) &&
    Array.isArray(o.variables) &&
    isSourceConfig(o.source)
  );
}

function describeUnsupported(x: unknown): string {
  if (typeof x === "object" && x !== null && "id" in x) {
    return `id "${String((x as Record<string, unknown>).id)}"`;
  }
  return "an entry with no recognizable id";
}

/**
 * Validates and narrows a batch of raw parsed JSON to `LayerConfig[]`, preserving order.
 * Entries whose `type` isn't `"vector"` (or that don't match the shape at all) are skipped with
 * a console warning — not implementing wfs/tile is a deliberate scope limit, not a bug. Real
 * validation failures (duplicate id, no fields, an unknown `default_variable`) throw with the
 * offending id.
 */
export function parseLayerConfigs(raw: unknown[]): LayerConfig[] {
  const seenIds = new Set<string>();
  const configs: LayerConfig[] = [];

  for (const entry of raw) {
    if (!isVectorLayerConfig(entry)) {
      console.warn(`Skipping unsupported layer config (${describeUnsupported(entry)}).`);
      continue;
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate layer config id: "${entry.id}"`);
    }
    if (entry.fields.length === 0) {
      throw new Error(`Layer config "${entry.id}" has no fields`);
    }
    if (!entry.variables.some((v) => v.id === entry.default_variable)) {
      throw new Error(
        `Layer config "${entry.id}" has default_variable "${entry.default_variable}" not present in variables`,
      );
    }
    seenIds.add(entry.id);
    configs.push(entry);
  }

  return configs;
}

/** Loads every pasted layer config, in a deterministic (file-path-sorted) order. */
export function loadLayerConfigs(): LayerConfig[] {
  const raw = Object.entries(rawModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, mod]) => mod.default);
  return parseLayerConfigs(raw);
}

/** Looks up a config by id in an already-loaded list. `undefined` when not found. */
export function getLayerConfig(configs: LayerConfig[], id: string): LayerConfig | undefined {
  return configs.find((c) => c.id === id);
}

/** Looks up a layer's variable by id. `undefined` when not found. */
export function getVariable(layerConfig: LayerConfig, variableId: string): LayerVariable | undefined {
  return layerConfig.variables.find((v) => v.id === variableId);
}
