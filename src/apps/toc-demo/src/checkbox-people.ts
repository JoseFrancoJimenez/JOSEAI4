import type { ICheckboxTreeNodeDef } from "@mini/lib/widgets";

/**
 * Same family tree as {@link people}, but as its own literal data — `checkbox-tree`'s `type`
 * (checkbox placement) would collide with `ITocNodeDef.type` (the old TOC widget's domain field,
 * e.g. `"person"`), so the two widgets don't share one array.
 */
interface IPersonDef {
  id: string;
  parent_id: string | null;
  expanded?: boolean;
}

/**
 * `expanded: true` on Alice and Bob (but no one deeper, and nothing under Diana) demonstrates that
 * the initial expand state is literal and per-node, not inherited: Alice and Bob start open, Frank
 * and everything under Diana start collapsed like any other branch.
 */
function familyDefs(): IPersonDef[] {
  return [
    { id: "Alice", parent_id: null, expanded: true },
    { id: "Bob", parent_id: "Alice", expanded: true },
    { id: "Carol", parent_id: "Alice" },
    { id: "Frank", parent_id: "Bob" },
    { id: "Grace", parent_id: "Bob" },
    { id: "Irene", parent_id: "Frank" },
    { id: "Karen", parent_id: "Irene" },

    { id: "Diana", parent_id: null },
    { id: "Ethan", parent_id: "Diana" },
    { id: "Henry", parent_id: "Ethan" },
    { id: "Jack", parent_id: "Henry" },
    { id: "Liam", parent_id: "Jack" },
  ];
}

/** Stamps `type: 'checkbox'` on every node — leaf and branch alike. */
function allCheckable(defs: IPersonDef[]): (IPersonDef & Pick<ICheckboxTreeNodeDef, "type">)[] {
  return defs.map((def) => ({ ...def, type: "checkbox" as const }));
}

/** Stamps `type: 'checkbox'` on leaves only; branches (any id named as a `parent_id`) stay `'label'`. */
function leavesCheckable(defs: IPersonDef[]): (IPersonDef & Pick<ICheckboxTreeNodeDef, "type">)[] {
  const branchIds = new Set(defs.map((def) => def.parent_id).filter((id) => id !== null));
  return defs.map((def) => ({ ...def, type: branchIds.has(def.id) ? undefined : ("checkbox" as const) }));
}

export { familyDefs, allCheckable, leavesCheckable };
