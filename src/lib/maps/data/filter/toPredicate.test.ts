import { describe, it, expect } from 'vitest';
import { toPredicate } from './toPredicate.ts';
import { and, or, eq, neq, gt, gte, lt, lte, like, isIn, isNull, notNull } from './ast.ts';

describe('toPredicate', () => {
  it('eq/neq use strict equality (no type coercion)', () => {
    expect(toPredicate(eq('a', 1))({ a: 1 })).toBe(true);
    expect(toPredicate(eq('a', 1))({ a: '1' })).toBe(false);
    expect(toPredicate(eq('a', 1))({})).toBe(false);
    expect(toPredicate(neq('a', 1))({ a: 2 })).toBe(true);
    expect(toPredicate(neq('a', 1))({ a: 1 })).toBe(false);
  });

  it('ordered comparisons work for numbers and reject type mismatches', () => {
    expect(toPredicate(gt('a', 5))({ a: 6 })).toBe(true);
    expect(toPredicate(gt('a', 5))({ a: 5 })).toBe(false);
    expect(toPredicate(gte('a', 5))({ a: 5 })).toBe(true);
    expect(toPredicate(lt('a', 5))({ a: 4 })).toBe(true);
    expect(toPredicate(lte('a', 5))({ a: 5 })).toBe(true);
    expect(toPredicate(gt('a', 5))({ a: '6' })).toBe(false);   // string vs number target
    expect(toPredicate(gt('a', 5))({})).toBe(false);           // absent
  });

  it('ordered comparisons work lexicographically for strings', () => {
    expect(toPredicate(gt('name', 'M'))({ name: 'Ontario' })).toBe(true);
    expect(toPredicate(lt('name', 'M'))({ name: 'Alberta' })).toBe(true);
  });

  it('like: % and _ wildcards, case-sensitive, anchored', () => {
    const contains = toPredicate(like('name', '%New%'));
    expect(contains({ name: 'New York' })).toBe(true);
    expect(contains({ name: 'Newfoundland' })).toBe(true);
    expect(contains({ name: 'new york' })).toBe(false);        // case-sensitive
    expect(contains({ name: 'Maine' })).toBe(false);

    expect(toPredicate(like('code', 'O_'))({ code: 'ON' })).toBe(true);
    expect(toPredicate(like('code', 'O_'))({ code: 'ONT' })).toBe(false);  // anchored

    expect(toPredicate(like('name', 'New%'))({ name: 'York New' })).toBe(false); // anchored at start
    expect(toPredicate(like('name', 'New'))({ name: 'New' })).toBe(true);
  });

  it('like escapes regex metacharacters in the pattern', () => {
    expect(toPredicate(like('v', '1.5'))({ v: '1.5' })).toBe(true);
    expect(toPredicate(like('v', '1.5'))({ v: '125' })).toBe(false);  // dot is literal
    expect(toPredicate(like('v', '(a)%'))({ v: '(a) test' })).toBe(true);
    expect(toPredicate(like('v', 'a+b'))({ v: 'a+b' })).toBe(true);
    expect(toPredicate(like('v', 'a+b'))({ v: 'aab' })).toBe(false);
  });

  it('like never matches non-string properties', () => {
    expect(toPredicate(like('v', '%1%'))({ v: 15 })).toBe(false);
  });

  it('in matches set membership strictly', () => {
    const pred = toPredicate(isIn('code', ['ON', 'QC', 24]));
    expect(pred({ code: 'ON' })).toBe(true);
    expect(pred({ code: 24 })).toBe(true);
    expect(pred({ code: '24' })).toBe(false);
    expect(pred({ code: 'BC' })).toBe(false);
  });

  it('isnull/notnull treat null and undefined alike, but not falsy values', () => {
    const nul = toPredicate(isNull('v'));
    const not = toPredicate(notNull('v'));
    expect(nul({ v: null })).toBe(true);
    expect(nul({})).toBe(true);
    expect(nul({ v: 0 })).toBe(false);
    expect(nul({ v: '' })).toBe(false);
    expect(not({ v: 0 })).toBe(true);
    expect(not({ v: null })).toBe(false);
  });

  it('and/or groups combine child predicates', () => {
    const node = and(eq('a', 1), or(eq('b', 2), eq('c', 3)));
    const pred = toPredicate(node);
    expect(pred({ a: 1, b: 2 })).toBe(true);
    expect(pred({ a: 1, c: 3 })).toBe(true);
    expect(pred({ a: 1 })).toBe(false);
    expect(pred({ b: 2, c: 3 })).toBe(false);
  });

  it('throws on empty groups and bad clause values', () => {
    expect(() => toPredicate(and())).toThrow('empty filter group');
    expect(() => toPredicate(isIn('a', []))).toThrow('non-empty array');
    expect(() => toPredicate({ kind: 'clause', field: 'a', op: 'like', value: 5 })).toThrow('string value');
  });
});
