// AWESOME AI

let counter = 0;

/** Document-unique id, `<prefix>-<n>`, for ARIA relationships generated at render time (`docs/accessibility.md` §6). */
function generateId(prefix: string): string {
  return `${prefix}-${counter++}`;
}

export { generateId };
