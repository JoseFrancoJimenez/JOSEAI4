/** CSS class names shared across the checkbox tree widget. Kept in one place so element and styles stay in sync. */
const treeCss = {
  view:       'checkbox-tree',
  row:        'tree-node__row',
  toggle:     'tree-node__toggle',
  toggleIcon: 'tree-node__toggle-icon',
  checkbox:   'tree-node__checkbox',
  content:    'tree-node__content',
  group:      'tree-node__group',
  leaf:       'is-leaf',
  expanded:   'is-expanded',
} as const;

/** Form controls a `<label>` can legitimately be associated with. */
const labelableSelector = 'input, select, textarea';

/**
 * Elements the keyboard handler treats as consumer-injected interactive content — defensive-only,
 * since a plain-text label never matches this. See the Accessibility model's `interactiveSelector` guard.
 */
const interactiveSelector = [
  'input',
  'button',
  'select',
  'textarea',
  'a[href]',
  'label[for]',                      // explicit association
  `label:has(${labelableSelector})`, // wrapping association
].join(', ');

/** Source of unique ids for each row's content wrapper, so `aria-labelledby` can point at it. */
let nextContentId = 0;

/** Returns a process-unique id string for a content wrapper (`tree-node-content-N`). */
function contentId(): string {
  return `tree-node-content-${nextContentId++}`;
}

export { treeCss, interactiveSelector, contentId };
