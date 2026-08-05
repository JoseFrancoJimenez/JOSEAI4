import { describe, it, expect } from 'vitest';
import { deepFreeze, guard } from './freeze.ts';

describe('Vitest environment', () => {
  it('runs with import.meta.env.DEV truthy, so guard exercises deepFreeze', () => {
    expect(import.meta.env.DEV).toBe(true);
  });
});

describe('deepFreeze', () => {
  it('freezes nested objects and arrays throughout', () => {
    const o = { a: { b: { c: 1 } }, list: [{ d: 2 }, [3, 4]] };
    deepFreeze(o);
    expect(Object.isFrozen(o)).toBe(true);
    expect(Object.isFrozen(o.a)).toBe(true);
    expect(Object.isFrozen(o.a.b)).toBe(true);
    expect(Object.isFrozen(o.list)).toBe(true);
    expect(Object.isFrozen(o.list[0])).toBe(true);
    expect(Object.isFrozen(o.list[1])).toBe(true);
  });

  it('is idempotent on already-frozen input', () => {
    const o = Object.freeze({ a: 1 });
    expect(() => deepFreeze(o)).not.toThrow();
    expect(deepFreeze(o)).toBe(o);
  });

  it('terminates on a cyclic object', () => {
    const o: { a: number; self?: unknown } = { a: 1 };
    o.self = o;
    expect(() => deepFreeze(o)).not.toThrow();
    expect(Object.isFrozen(o)).toBe(true);
  });

  it('leaves primitives and null untouched', () => {
    expect(deepFreeze(1)).toBe(1);
    expect(deepFreeze('x')).toBe('x');
    expect(deepFreeze(true)).toBe(true);
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(undefined)).toBe(undefined);
  });

  it('a frozen object throws on mutation (strict-mode ESM)', () => {
    const o = deepFreeze<{ a: number }>({ a: 1 });
    expect(() => {
      o.a = 2;
    }).toThrow();
  });

  it('a frozen nested value throws on mutation too', () => {
    const o = deepFreeze<{ a: { b: number } }>({ a: { b: 1 } });
    expect(() => {
      o.a.b = 2;
    }).toThrow();
  });
});

describe('guard', () => {
  it('behaves like deepFreeze under Vitest (DEV is truthy)', () => {
    const o = guard<{ a: number }>({ a: 1 });
    expect(Object.isFrozen(o)).toBe(true);
    expect(() => {
      o.a = 2;
    }).toThrow();
  });
});
