import { describe, expect, it } from 'vitest';
import { resolveMove } from './resolve-move.ts';
import type { ButtonGroupOrientation } from './resolve-move.ts';

const allEnabled = [false, false, false, false, false];

describe('resolveMove — arrow keys', () => {
  const orientations: {
    orientation: ButtonGroupOrientation;
    forwardKey: string;
    backwardKey: string;
    offAxisKeys: string[];
    forwardStep: 1 | -1;
    backwardStep: 1 | -1;
  }[] = [
    { orientation: 'horizontal', forwardKey: 'ArrowRight', backwardKey: 'ArrowLeft', offAxisKeys: ['ArrowUp', 'ArrowDown'], forwardStep: 1, backwardStep: -1 },
    { orientation: 'horizontal-reversed', forwardKey: 'ArrowRight', backwardKey: 'ArrowLeft', offAxisKeys: ['ArrowUp', 'ArrowDown'], forwardStep: -1, backwardStep: 1 },
    { orientation: 'vertical', forwardKey: 'ArrowDown', backwardKey: 'ArrowUp', offAxisKeys: ['ArrowLeft', 'ArrowRight'], forwardStep: 1, backwardStep: -1 },
    { orientation: 'vertical-reversed', forwardKey: 'ArrowDown', backwardKey: 'ArrowUp', offAxisKeys: ['ArrowLeft', 'ArrowRight'], forwardStep: -1, backwardStep: 1 },
  ];

  it.each(orientations)('$orientation: forward/backward keys step by DOM index in the right direction', ({ orientation, forwardKey, backwardKey, forwardStep, backwardStep }) => {
    expect(resolveMove({ count: 5, current: 2, disabled: allEnabled, key: forwardKey, orientation })).toBe(2 + forwardStep);
    expect(resolveMove({ count: 5, current: 2, disabled: allEnabled, key: backwardKey, orientation })).toBe(2 + backwardStep);
  });

  it.each(orientations)('$orientation: off-axis keys are ignored', ({ orientation, offAxisKeys }) => {
    for (const key of offAxisKeys) {
      expect(resolveMove({ count: 5, current: 2, disabled: allEnabled, key, orientation })).toBeNull();
    }
  });

  it.each(orientations)('$orientation: no wraparound at either boundary', ({ orientation, forwardKey, backwardKey, forwardStep, backwardStep }) => {
    const atForwardEdge = forwardStep === 1 ? 4 : 0;
    const atBackwardEdge = backwardStep === 1 ? 4 : 0;
    expect(resolveMove({ count: 5, current: atForwardEdge, disabled: allEnabled, key: forwardKey, orientation })).toBeNull();
    expect(resolveMove({ count: 5, current: atBackwardEdge, disabled: allEnabled, key: backwardKey, orientation })).toBeNull();
  });

  it('skips a run of consecutive disabled children', () => {
    expect(resolveMove({ count: 5, current: 0, disabled: [false, true, true, false, false], key: 'ArrowRight', orientation: 'horizontal' })).toBe(3);
  });

  it('a run of disabled through the end resolves to null, not the last disabled index', () => {
    expect(resolveMove({ count: 4, current: 1, disabled: [false, false, true, true], key: 'ArrowRight', orientation: 'horizontal' })).toBeNull();
  });

  it('arrows never activate — they only ever return an index or null', () => {
    const result = resolveMove({ count: 5, current: 2, disabled: allEnabled, key: 'ArrowRight', orientation: 'horizontal' });
    expect(typeof result === 'number' || result === null).toBe(true);
  });
});

describe('resolveMove — Home/End', () => {
  const orientations: { orientation: ButtonGroupOrientation; home: number; end: number }[] = [
    { orientation: 'horizontal', home: 0, end: 4 },
    { orientation: 'horizontal-reversed', home: 4, end: 0 },
    { orientation: 'vertical', home: 0, end: 4 },
    { orientation: 'vertical-reversed', home: 4, end: 0 },
  ];

  it.each(orientations)('$orientation: Home/End target the visual ends', ({ orientation, home, end }) => {
    expect(resolveMove({ count: 5, current: 2, disabled: allEnabled, key: 'Home', orientation })).toBe(home);
    expect(resolveMove({ count: 5, current: 2, disabled: allEnabled, key: 'End', orientation })).toBe(end);
  });

  it('Home skips a disabled visual-first child', () => {
    expect(resolveMove({ count: 5, current: 3, disabled: [true, true, false, false, false], key: 'Home', orientation: 'horizontal' })).toBe(2);
  });

  it('End skips a disabled visual-last child', () => {
    expect(resolveMove({ count: 5, current: 1, disabled: [false, false, false, true, true], key: 'End', orientation: 'horizontal' })).toBe(2);
  });
});

describe('resolveMove — boundaries', () => {
  it('exactly one enabled child: every movement key is a no-op', () => {
    const disabled = [true, true, false, true, true];
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(resolveMove({ count: 5, current: 2, disabled, key, orientation: 'horizontal' })).toBeNull();
    }
  });

  it('no enabled children: every movement key resolves to null', () => {
    const disabled = [true, true, true];
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(resolveMove({ count: 3, current: 1, disabled, key, orientation: 'horizontal' })).toBeNull();
    }
  });

  it('empty group: every movement key resolves to null', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(resolveMove({ count: 0, current: -1, disabled: [], key, orientation: 'horizontal' })).toBeNull();
    }
  });

  it('an unhandled key resolves to null', () => {
    expect(resolveMove({ count: 5, current: 2, disabled: allEnabled, key: 'Tab', orientation: 'horizontal' })).toBeNull();
  });
});
