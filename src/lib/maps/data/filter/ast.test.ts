import { describe, it, expect } from 'vitest';
import { parseFilterNode, and, or, eq, isIn, isNull, like } from './ast.ts';

describe('parseFilterNode', () => {
  it('accepts round-tripped builder output', () => {
    const node = and(eq('A', 1), or(like('B', '%x%'), isNull('C')), isIn('D', ['x', 2]));
    expect(parseFilterNode(JSON.parse(JSON.stringify(node)))).toEqual(node);
  });

  it('rejects malformed shapes anywhere in the tree', () => {
    expect(parseFilterNode(null)).toBeUndefined();
    expect(parseFilterNode('eq')).toBeUndefined();
    expect(parseFilterNode({ kind: 'clause', field: 1, op: 'eq' })).toBeUndefined();
    expect(parseFilterNode({ kind: 'clause', field: 'A', op: 'drop' })).toBeUndefined();
    expect(parseFilterNode({ kind: 'clause', field: 'A', op: 'eq', value: { evil: 1 } })).toBeUndefined();
    expect(parseFilterNode({ kind: 'clause', field: 'A', op: 'in', value: [1, {}] })).toBeUndefined();
    expect(parseFilterNode({ kind: 'group', op: 'and', clauses: [] })).toBeUndefined();
    expect(parseFilterNode({ kind: 'group', op: 'xor', clauses: [eq('A', 1)] })).toBeUndefined();
    expect(parseFilterNode({ kind: 'group', op: 'and', clauses: [{ kind: 'clause' }] })).toBeUndefined();
  });

  it('keeps valueless ops valueless', () => {
    expect(parseFilterNode({ kind: 'clause', field: 'A', op: 'isnull' })).toEqual(isNull('A'));
  });
});
