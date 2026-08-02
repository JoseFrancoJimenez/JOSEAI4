import { describe, it, expect } from 'vitest';
import { toCql } from './toCql.ts';
import { and, or, eq, neq, gt, gte, lt, lte, like, isIn, isNull, notNull, combineAnd, collectFilterFields } from './ast.ts';

describe('toCql', () => {
  it('compiles comparisons with string quoting and bare numbers', () => {
    expect(toCql(eq('STATE_NAME', 'Ontario'))).toBe("STATE_NAME = 'Ontario'");
    expect(toCql(eq('POP', 1500000))).toBe('POP = 1500000');
    expect(toCql(neq('CODE', 'ON'))).toBe("CODE <> 'ON'");
    expect(toCql(gt('POP', 5))).toBe('POP > 5');
    expect(toCql(gte('POP', 5))).toBe('POP >= 5');
    expect(toCql(lt('POP', 5))).toBe('POP < 5');
    expect(toCql(lte('POP', 5))).toBe('POP <= 5');
  });

  it("doubles single quotes in string literals (O'Neil)", () => {
    expect(toCql(eq('OWNER', "O'Neil"))).toBe("OWNER = 'O''Neil'");
    expect(toCql(eq('NOTE', "it's ''quoted''"))).toBe("NOTE = 'it''s ''''quoted'''''");
  });

  it('passes % wildcards through LIKE', () => {
    expect(toCql(like('STATE_NAME', '%New%'))).toBe("STATE_NAME LIKE '%New%'");
  });

  it('compiles IN with mixed values', () => {
    expect(toCql(isIn('CODE', ['ON', 'QC', 24]))).toBe("CODE IN ('ON', 'QC', 24)");
  });

  it('compiles null checks', () => {
    expect(toCql(isNull('NOTES'))).toBe('NOTES IS NULL');
    expect(toCql(notNull('NOTES'))).toBe('NOTES IS NOT NULL');
  });

  it('parenthesizes groups and nests correctly', () => {
    const node = and(eq('A', 1), or(eq('B', 2), eq('C', 3)));
    expect(toCql(node)).toBe('(A = 1 AND (B = 2 OR C = 3))');
  });

  it('throws on empty groups, empty IN lists, and missing scalar values', () => {
    expect(() => toCql(and())).toThrow('empty filter group');
    expect(() => toCql(isIn('A', []))).toThrow('non-empty array');
    expect(() => toCql({ kind: 'clause', field: 'A', op: 'eq' })).toThrow('scalar value');
  });
});

describe('combineAnd', () => {
  it('drops undefined, unwraps singles, groups multiples', () => {
    expect(combineAnd(undefined, undefined)).toBeUndefined();
    const single = eq('A', 1);
    expect(combineAnd(undefined, single)).toBe(single);
    expect(toCql(combineAnd(eq('A', 1), undefined, eq('B', 2))!)).toBe('(A = 1 AND B = 2)');
  });
});

describe('toCql field validation', () => {
  it('rejects field names that are not plain identifiers', () => {
    expect(() => toCql(eq('NAME) OR (1=1', 'x'))).toThrow('illegal field name');
    expect(() => toCql(eq("A'B", 1))).toThrow('illegal field name');
    expect(() => toCql(eq('DROP TABLE x', 1))).toThrow('illegal field name');
  });

  it('enforces the knownFields allowlist, including nested clauses', () => {
    const knownFields = new Set(['STATE_NAME', 'PERSONS']);
    expect(toCql(eq('STATE_NAME', 'Maine'), { knownFields })).toBe("STATE_NAME = 'Maine'");
    expect(() => toCql(eq('GHOST', 1), { knownFields })).toThrow('unknown field "GHOST"');
    expect(() => toCql(and(eq('STATE_NAME', 'x'), or(eq('PERSONS', 1), eq('GHOST', 1))), { knownFields }))
      .toThrow('unknown field "GHOST"');
  });

  it('an empty allowlist rejects every field', () => {
    expect(() => toCql(eq('A', 1), { knownFields: new Set() })).toThrow('unknown field');
  });
});

describe('collectFilterFields', () => {
  it('collects every referenced field depth-first', () => {
    const node = and(eq('A', 1), or(eq('B', 2), isNull('C')), eq('A', 3));
    expect(collectFilterFields(node)).toEqual(['A', 'B', 'C', 'A']);
    expect(collectFilterFields(eq('X', 1))).toEqual(['X']);
  });
});
