import { describe, it, expect } from 'vitest';
import { toEsriWhere } from './toEsriWhere.ts';
import { and, or, eq, neq, like, isIn, isNull, notNull, gt } from './ast.ts';

describe('toEsriWhere', () => {
  it('compiles comparisons in SQL-92 flavor', () => {
    expect(toEsriWhere(eq('PRENAME', 'Ontario'))).toBe("PRENAME = 'Ontario'");
    expect(toEsriWhere(neq('PRUID', 35))).toBe('PRUID <> 35');
    expect(toEsriWhere(gt('LANDAREA', 1000.5))).toBe('LANDAREA > 1000.5');
    expect(toEsriWhere(like('PRENAME', 'Nova%'))).toBe("PRENAME LIKE 'Nova%'");
    expect(toEsriWhere(isIn('PRUID', [10, 11, 12]))).toBe('PRUID IN (10, 11, 12)');
    expect(toEsriWhere(isNull('NOTES'))).toBe('NOTES IS NULL');
    expect(toEsriWhere(notNull('NOTES'))).toBe('NOTES IS NOT NULL');
  });

  it('doubles single quotes in string literals', () => {
    expect(toEsriWhere(eq('OWNER', "O'Neil"))).toBe("OWNER = 'O''Neil'");
  });

  it('parenthesizes nested groups', () => {
    const node = or(and(eq('A', 1), eq('B', 2)), eq('C', 'x'));
    expect(toEsriWhere(node)).toBe("((A = 1 AND B = 2) OR C = 'x')");
  });

  it('throws on empty groups and empty IN lists', () => {
    expect(() => toEsriWhere(or())).toThrow('empty filter group');
    expect(() => toEsriWhere(isIn('A', []))).toThrow('non-empty array');
  });

  it('rejects non-identifier field names', () => {
    expect(() => toEsriWhere(eq('1=1; DELETE', 'x'))).toThrow('illegal field name');
  });

  it('enforces the knownFields allowlist, including nested clauses', () => {
    const knownFields = new Set(['PRENAME']);
    expect(toEsriWhere(eq('PRENAME', 'Ontario'), { knownFields })).toBe("PRENAME = 'Ontario'");
    expect(() => toEsriWhere(eq('GHOST', 1), { knownFields })).toThrow('unknown field "GHOST"');
    expect(() => toEsriWhere(and(eq('PRENAME', 'x'), eq('GHOST', 1)), { knownFields }))
      .toThrow('unknown field "GHOST"');
  });
});
