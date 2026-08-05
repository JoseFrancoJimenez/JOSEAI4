import type { ICheckboxTreeNodeDef } from "@mini/lib/widgets";
import type { LayerConfig } from "../config/types.ts";

export type { ICheckboxTreeNodeDef as TreeDef };

/**
 * Lowercases, replaces each run of non-alphanumeric characters with a single `-`, and trims
 * leading/trailing `-`. **This is a URL contract**: group ids (`group:<slug>`) appear in
 * `expandedIds` in the share link, so this must stay deterministic — never change this
 * algorithm without a version bump in the share-link format (Task 24).
 */
export function slugify(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Derives TOC defs from layer configs — the TOC is never separately configured. Root order and
 * within-group order both follow **reversed** `layerOrder` (top-drawn layer first); a group's
 * position is set by its first appearance while scanning that reversed order, and its own def is
 * emitted right there, before any of its children. Layers without a `category` become
 * root-level leaves. `expandedIds` stamps `expanded: true` on exactly the named groups — callers
 * decide what that set is (e.g. "every group" on a fresh load, or a restored share link).
 */
export function buildTreeDefs(configs: LayerConfig[], options: { expandedIds: string[] }): ICheckboxTreeNodeDef[] {
  const expandedSet = new Set(options.expandedIds);
  const defs: ICheckboxTreeNodeDef[] = [];
  const seenGroupIds = new Set<string>();

  for (const config of [...configs].reverse()) {
    if (!config.category) {
      defs.push({ id: config.id, parent_id: null, type: "checkbox" });
      continue;
    }

    const groupId = `group:${slugify(config.category)}`;
    if (!seenGroupIds.has(groupId)) {
      seenGroupIds.add(groupId);
      defs.push({ id: groupId, parent_id: null, type: "checkbox", expanded: expandedSet.has(groupId) });
    }
    defs.push({ id: config.id, parent_id: groupId, type: "checkbox" });
  }

  return defs;
}
