import { describe, it, expect } from 'vitest';
import { generateId } from './ids.ts';

describe('generateId', () => {
  it('prefixes the returned id', () => {
    expect(generateId('foo')).toMatch(/^foo-\d+$/);
  });

  it('never returns the same id twice, even for the same prefix', () => {
    const a = generateId('foo');
    const b = generateId('foo');
    expect(a).not.toBe(b);
  });
});
