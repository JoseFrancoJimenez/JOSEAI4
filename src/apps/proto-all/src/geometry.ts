// AWESOME AI

interface Size {
  width: number;
  height: number;
}

/**
 * Pulls a `size`-sized box positioned at (`x`, `y`) back so it fits inside a same-origin
 * `bounds` box, without ever pushing it past the *opposite* edge — a box larger than `bounds` on
 * some axis just stays partially out of view on that axis rather than flipping which corner it's
 * anchored to. Pure geometry: no DOM access, so nothing here needs jsdom to test.
 */
function clampTo(x: number, y: number, size: Size, bounds: Size): { x: number; y: number } {
  const maxX = Math.max(0, bounds.width - size.width);
  const maxY = Math.max(0, bounds.height - size.height);
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
}

export { clampTo };
export type { Size };
