// AWESOME AI

/** CSS class names for `<widget-floating-panel>`. Kept in one place so the element and its stylesheet stay in sync. */
const cls = {
  host: 'widget-floating-panel',
  card: 'widget-floating-panel__card',
  close: 'widget-floating-panel__close',
  live: 'widget-floating-panel__live',
} as const;

/** `default` must be declared: unmarked children and bare text land there (`docs/regions.md` §3). */
const regionNames = ['header', 'default', 'footer'] as const;

/** Elements the focus trap treats as Tab stops — a native focusability check, not a role check. */
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export { cls, regionNames, focusableSelector };
