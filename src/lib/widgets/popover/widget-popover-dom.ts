// AWESOME AI

/** CSS class names for `<widget-popover>`. Kept in one place so the element and its stylesheet stay in sync. */
const cls = {
  host: 'widget-popover',
  card: 'widget-popover__card',
  close: 'widget-popover__close',
  live: 'widget-popover__live',
} as const;

/** `default` must be declared: unmarked children and bare text land there (`docs/regions.md` §3). */
const regionNames = ['header', 'default', 'footer'] as const;

export { cls, regionNames };
