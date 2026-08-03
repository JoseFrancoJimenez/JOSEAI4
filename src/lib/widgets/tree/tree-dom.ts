/** CSS class names shared across the tree widget. Kept in one place so element and styles stay in sync. */
const treeCss = {
  view:          'tree-view',
  node:          'tree-node',
  row:           'tree-node__row',
  toggle:        'tree-node__toggle',
  toggleIcon:    'tree-node__toggle-icon',
  content:       'tree-node__content',
  group:         'tree-node__group',
  expanded:      'is-expanded',
  leaf:          'is-leaf',
} as const;

/** Form controls a `<label>` can legitimately be associated with. */
const labelableSelector = 'input, select, textarea';

/**
 * Elements that should absorb a click without triggering expand/collapse — a control the consumer
 * placed inside a row's content. Clicking one of these must not toggle the node.
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
