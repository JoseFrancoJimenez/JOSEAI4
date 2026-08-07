/** CSS class names for `<ui-button>`. Kept in one place so the element and its stylesheet stay in sync. */
const cls = {
  host: 'ui-button',
  control: 'ui-button__control',
  icon: 'ui-button__icon',
  label: 'ui-button__label',
} as const;

/** Content regions `<ui-button>` accepts. `'default'` is the label; `'icon'` is the leading/trailing icon. */
type UiButtonRegion = 'default' | 'icon';

const regionNames: readonly UiButtonRegion[] = ['default', 'icon'];

export { cls, regionNames };
export type { UiButtonRegion };
