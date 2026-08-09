type ButtonGroupOrientation =
  | 'horizontal' | 'horizontal-reversed'
  | 'vertical'   | 'vertical-reversed';

/** Input to {@link resolveMove}: the group's shape, the current tab stop, and the key pressed. */
interface ResolveMoveInput {
  count: number;
  current: number;
  disabled: readonly boolean[];
  key: string;
  orientation: ButtonGroupOrientation;
}

/** The arrow key that moves forward (toward higher DOM index) on each axis, before reversal. */
const FORWARD_KEY: Record<'horizontal' | 'vertical', string> = {
  horizontal: 'ArrowRight',
  vertical: 'ArrowDown',
};

/** The arrow key that moves backward (toward lower DOM index) on each axis, before reversal. */
const BACKWARD_KEY: Record<'horizontal' | 'vertical', string> = {
  horizontal: 'ArrowLeft',
  vertical: 'ArrowUp',
};

/**
 * Pure movement rule for `widget-button-group` — no DOM. Given the group's shape and the key
 * pressed, returns the target index, or `null` when nothing should happen: an off-axis key, a
 * boundary with no wraparound, or a move that would land back on `current` (e.g. a single
 * enabled child). `null` doubles as the signal that the element must not call `preventDefault()`.
 *
 * Movement is always in **visual** order (`rationale.md`: keyboard follows the eye, not the DOM):
 * a `*-reversed` orientation flips which DOM direction each arrow key steps toward, and flips
 * which end `Home`/`End` target, but never changes which key the user presses for "right"/"down".
 */
function resolveMove(input: ResolveMoveInput): number | null {
  if (input.count === 0) return null;
  const target = targetFor(input);
  return target === null || target === input.current ? null : target;
}

/** Dispatches on the key pressed. Returns `null` for a key the group does not handle. */
function targetFor(input: ResolveMoveInput): number | null {
  const { key, orientation, disabled } = input;
  if (key === 'Home' || key === 'End') return edgeTarget(key, orientation.endsWith('-reversed'), disabled);
  return arrowTarget(input);
}

/**
 * `Home`/`End` target the visual first/last enabled child. `Home` targets DOM index 0 unless
 * reversed, in which case the visual-first child is the *last* DOM child — and symmetrically
 * for `End` — so exactly one of the four (key, reversed) combinations targets DOM index 0.
 */
function edgeTarget(key: 'Home' | 'End', reversed: boolean, disabled: readonly boolean[]): number | null {
  const targetsStart = (key === 'Home') !== reversed;
  return targetsStart ? firstEnabled(0, 1, disabled) : firstEnabled(disabled.length - 1, -1, disabled);
}

/** Arrow keys step one DOM position from `current`, in the direction the pressed key means on this axis. */
function arrowTarget({ current, disabled, key, orientation }: ResolveMoveInput): number | null {
  const axis: 'horizontal' | 'vertical' = orientation.startsWith('horizontal') ? 'horizontal' : 'vertical';
  const reversed = orientation.endsWith('-reversed');

  if (key === FORWARD_KEY[axis]) return step(current, reversed ? -1 : 1, disabled);
  if (key === BACKWARD_KEY[axis]) return step(current, reversed ? 1 : -1, disabled);
  return null;
}

/** Walks from `current` in `direction` (±1) increments, returning the first enabled index, or `null` at the end. */
function step(current: number, direction: 1 | -1, disabled: readonly boolean[]): number | null {
  let i = current + direction;
  while (i >= 0 && i < disabled.length) {
    if (!disabled[i]) return i;
    i += direction;
  }
  return null;
}

/** Walks from `start` in `direction` increments (`start` included), returning the first enabled index, or `null`. */
function firstEnabled(start: number, direction: 1 | -1, disabled: readonly boolean[]): number | null {
  return step(start - direction, direction, disabled);
}

export { resolveMove };
export type { ButtonGroupOrientation, ResolveMoveInput };
