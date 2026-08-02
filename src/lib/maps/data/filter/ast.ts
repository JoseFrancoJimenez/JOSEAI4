/**
 * Backend-neutral filter AST (ADR-4). Widgets build these nodes; the three
 * compilers (`toCql`, `toEsriWhere`, `toPredicate`) translate them. No CQL or
 * SQL syntax ever leaves `src/lib/mapping/data`.
 */

export type ComparisonOp =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'in'
  | 'isnull' | 'notnull';

export type FilterValue = string | number | (string | number)[];

export interface FilterClause {
  kind: 'clause';
  field: string;
  op: ComparisonOp;
  value?: FilterValue;
}

export interface FilterGroup {
  kind: 'group';
  op: 'and' | 'or';
  clauses: FilterNode[];
}

export type FilterNode = FilterClause | FilterGroup;

// ── Builder helpers ──────────────────────────────────────────────────────────

const clause = (field: string, op: ComparisonOp, value?: FilterValue): FilterClause =>
  ({ kind: 'clause', field, op, value });

export const eq  = (field: string, value: string | number): FilterClause => clause(field, 'eq', value);
export const neq = (field: string, value: string | number): FilterClause => clause(field, 'neq', value);
export const gt  = (field: string, value: string | number): FilterClause => clause(field, 'gt', value);
export const gte = (field: string, value: string | number): FilterClause => clause(field, 'gte', value);
export const lt  = (field: string, value: string | number): FilterClause => clause(field, 'lt', value);
export const lte = (field: string, value: string | number): FilterClause => clause(field, 'lte', value);
/** `%` and `_` wildcards are passed through to the backend / predicate. */
export const like = (field: string, value: string): FilterClause => clause(field, 'like', value);
export const isIn = (field: string, values: (string | number)[]): FilterClause => clause(field, 'in', values);
export const isNull  = (field: string): FilterClause => clause(field, 'isnull');
export const notNull = (field: string): FilterClause => clause(field, 'notnull');

export const and = (...clauses: FilterNode[]): FilterGroup => ({ kind: 'group', op: 'and', clauses });
export const or  = (...clauses: FilterNode[]): FilterGroup => ({ kind: 'group', op: 'or', clauses });

/**
 * AND-combines the given nodes, skipping `undefined`s. Returns the single node
 * unwrapped, or `undefined` when nothing remains — so callers can omit the
 * whole query parameter.
 */
export function combineAnd(...nodes: (FilterNode | undefined)[]): FilterNode | undefined {
  const present = nodes.filter((n): n is FilterNode => n !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return and(...present);
}

// ── Field-name validation (shared by the string compilers) ───────────────────

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/**
 * Guards a field name about to be interpolated into a compiled query string.
 * Values are quoted and escaped by the compilers, but identifiers cannot be —
 * so they are validated instead: the name must be a plain identifier, and,
 * when `knownFields` is provided, one of the layer's known columns.
 */
export function assertQueryField(
  field: string,
  knownFields: ReadonlySet<string> | undefined,
  dialect: string,
): void {
  if (!FIELD_NAME.test(field)) {
    throw new Error(`${dialect}: illegal field name "${field}"`);
  }
  if (knownFields && !knownFields.has(field)) {
    throw new Error(`${dialect}: unknown field "${field}"`);
  }
}

/** Every field name referenced by `node`, depth-first (duplicates preserved). */
export function collectFilterFields(node: FilterNode): string[] {
  if (node.kind === 'group') return node.clauses.flatMap(collectFilterFields);
  return [node.field];
}

// ── Untrusted-input validation ───────────────────────────────────────────────

const COMPARISON_OPS: ReadonlySet<string> = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'isnull', 'notnull',
]);

/**
 * Narrows an untrusted value (URL payload, persisted JSON) to a well-formed
 * {@link FilterNode}, or `undefined` when the shape is invalid anywhere in the
 * tree. Field-name/allowlist checks still happen at compile time — this only
 * guarantees structure.
 */
export function parseFilterNode(value: unknown): FilterNode | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const node = value as Record<string, unknown>;

  if (node['kind'] === 'group') {
    if (node['op'] !== 'and' && node['op'] !== 'or') return undefined;
    if (!Array.isArray(node['clauses']) || node['clauses'].length === 0) return undefined;
    const clauses: FilterNode[] = [];
    for (const raw of node['clauses']) {
      const clause = parseFilterNode(raw);
      if (!clause) return undefined;
      clauses.push(clause);
    }
    return { kind: 'group', op: node['op'], clauses };
  }

  if (node['kind'] === 'clause') {
    const field = node['field'];
    const op = node['op'];
    if (typeof field !== 'string' || typeof op !== 'string' || !COMPARISON_OPS.has(op)) return undefined;
    const raw = node['value'];
    let value: FilterValue | undefined;
    if (typeof raw === 'string' || typeof raw === 'number') value = raw;
    else if (Array.isArray(raw) && raw.every(v => typeof v === 'string' || typeof v === 'number')) value = raw;
    else if (raw !== undefined) return undefined;
    return clause(field, op as ComparisonOp, value);
  }

  return undefined;
}
