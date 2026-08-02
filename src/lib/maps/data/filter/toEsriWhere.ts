import { assertQueryField, type FilterClause, type FilterNode } from './ast.ts';

/** Options accepted by {@link toEsriWhere}. */
export interface CompileOptions {
  /** Allowlist of queryable columns; clauses on any other field throw. */
  knownFields?: ReadonlySet<string>;
}

/**
 * Compiles a {@link FilterNode} to a SQL-92 `where` clause for ArcGIS REST
 * `query` endpoints. Same semantics as `toCql`; kept separate because the two
 * dialects are free to diverge (functions, date literals, …).
 */
export function toEsriWhere(node: FilterNode, options: CompileOptions = {}): string {
  if (node.kind === 'group') {
    if (node.clauses.length === 0) throw new Error('toEsriWhere: empty filter group');
    const parts = node.clauses.map(clause => toEsriWhere(clause, options));
    return `(${parts.join(` ${node.op.toUpperCase()} `)})`;
  }
  return clauseToWhere(node, options);
}

function clauseToWhere(clause: FilterClause, options: CompileOptions): string {
  const { field, op } = clause;
  assertQueryField(field, options.knownFields, 'toEsriWhere');
  switch (op) {
    case 'eq':  return `${field} = ${literal(requireScalar(clause))}`;
    case 'neq': return `${field} <> ${literal(requireScalar(clause))}`;
    case 'gt':  return `${field} > ${literal(requireScalar(clause))}`;
    case 'gte': return `${field} >= ${literal(requireScalar(clause))}`;
    case 'lt':  return `${field} < ${literal(requireScalar(clause))}`;
    case 'lte': return `${field} <= ${literal(requireScalar(clause))}`;
    case 'like': return `${field} LIKE ${literal(requireScalar(clause))}`;
    case 'in': {
      const values = clause.value;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`toEsriWhere: "in" clause on "${field}" needs a non-empty array value`);
      }
      return `${field} IN (${values.map(literal).join(', ')})`;
    }
    case 'isnull':  return `${field} IS NULL`;
    case 'notnull': return `${field} IS NOT NULL`;
  }
}

function requireScalar(clause: FilterClause): string | number {
  const { value, op, field } = clause;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`toEsriWhere: "${op}" clause on "${field}" needs a scalar value`);
  }
  return value;
}

/** Numbers bare; strings single-quoted with `'` doubled. */
function literal(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}
