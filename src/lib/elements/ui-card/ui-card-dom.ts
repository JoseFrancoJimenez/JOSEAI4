// AWESOME AI

/** CSS class names for `<ui-card>`. Kept in one place so the element and its stylesheet stay in sync. */
const cls = {
  host: 'ui-card',
  header: 'ui-card__header',
  body: 'ui-card__body',
  footer: 'ui-card__footer',
} as const;

/** `default` must be declared: unmarked children and bare text land there (`docs/regions.md` §3). */
const regionNames = ['header', 'default', 'footer'] as const;

export { cls, regionNames };
