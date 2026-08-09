/** CSS class names for `<ui-button>`. Kept in one place so the element and its stylesheet stay in sync. */
const cls = {
  host: 'ui-button',
  control: 'ui-button__control',
  icon: 'ui-button__icon',
  label: 'ui-button__label',
} as const;

/**
 * ARIA attributes forwarded from the host to the inner control, since the host has no role and
 * is never a focus target — a name or state left on it would never be announced.
 */
const forwardedAria = [
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-expanded',
] as const;

export { cls, forwardedAria };
