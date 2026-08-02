/** CSS class names shared between `TocComponent` and `TocNodeElement`. Kept in one place so both stay in sync. */
const tocCss = {
  root:              'toc-component',
  list:              'toc-list',
  listNested:        'toc-list--nested',
  row:               'toc-row',
  toggle:            'toc-toggle',
  toggleLeaf:        'toc-toggle--leaf',
  arrow:             'toc-arrow',
  content:           'toc-content',
  contentExpandable: 'toc-content--expandable',
  nodeLabel:         'toc-node-label',
  expanded:          'is-expanded',
} as const;

/** Form controls a <label> can legitimately be associated with. */
const labelableSelector = 'input, select, textarea';

/** Elements that should absorb a click without triggering expand/collapse (e.g. a control inside consumer content). */
const interactiveSelector = [
  'input',
  'button',
  'select',
  'textarea',
  'a[href]',
  'label[for]',                      // explicit association
  `label:has(${labelableSelector})`, // wrapping association
].join(', ');

export { tocCss, interactiveSelector };
