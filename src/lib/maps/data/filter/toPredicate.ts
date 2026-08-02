import type { FilterClause, FilterNode } from './ast.ts';

export type FeaturePredicate = (props: Record<string, unknown>) => boolean;

/**
 * Compiles a {@link FilterNode} to a client-side predicate over feature
 * properties. Same semantics as the backend compilers; `like` is
 * case-sensitive with `%`/`_` wildcards.
 */
export function toPredicate(node: FilterNode): FeaturePredicate {
  if (node.kind === 'group') {
    if (node.clauses.length === 0) throw new Error('toPredicate: empty filter group');
    const parts = node.clauses.map(toPredicate);
    return node.op === 'and'
      ? props => parts.every(p => p(props))
      : props => parts.some(p => p(props));
  }
  return clauseToPredicate(node);
}

function clauseToPredicate(clause: FilterClause): FeaturePredicate {
  const { field, op } = clause;
  switch (op) {
    case 'eq':  { const v = requireScalar(clause); return props => props[field] === v; }
    case 'neq': { const v = requireScalar(clause); return props => props[field] !== v; }
    case 'gt':  { const v = requireScalar(clause); return props => compares(props[field], v, (a, b) => a > b); }
    case 'gte': { const v = requireScalar(clause); return props => compares(props[field], v, (a, b) => a >= b); }
    case 'lt':  { const v = requireScalar(clause); return props => compares(props[field], v, (a, b) => a < b); }
    case 'lte': { const v = requireScalar(clause); return props => compares(props[field], v, (a, b) => a <= b); }
    case 'like': {
      const pattern = requireScalar(clause);
      if (typeof pattern !== 'string') {
        throw new Error(`toPredicate: "like" clause on "${field}" needs a string value`);
      }
      const re = likeToRegExp(pattern);
      return props => typeof props[field] === 'string' && re.test(props[field]);
    }
    case 'in': {
      const values = clause.value;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`toPredicate: "in" clause on "${field}" needs a non-empty array value`);
      }
      const set = new Set<unknown>(values);
      return props => set.has(props[field]);
    }
    case 'isnull':  return props => props[field] === null || props[field] === undefined;
    case 'notnull': return props => props[field] !== null && props[field] !== undefined;
  }
}

function requireScalar(clause: FilterClause): string | number {
  const { value, op, field } = clause;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`toPredicate: "${op}" clause on "${field}" needs a scalar value`);
  }
  return value;
}

/** Ordered comparison; false when the property is absent or of a different type. */
function compares(
  propValue: unknown,
  target: string | number,
  cmp: (a: string | number, b: string | number) => boolean,
): boolean {
  if (typeof propValue !== typeof target) return false;
  return cmp(propValue as string | number, target);
}

/** Converts a LIKE pattern to a RegExp: `%` → `.*`, `_` → `.`, everything else escaped. */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('%', '.*').replaceAll('_', '.')}$`);
}
