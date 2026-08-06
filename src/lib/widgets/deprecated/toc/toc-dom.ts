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

/** Attribute an `html()` template puts on any element it needs to reference after build. */
const ELEMENT_NAME_ATTR = 'elementName';

/** Scans `root`'s descendants for `[elementName]` and returns a lookup keyed by that attribute's value. */
function collectElementsByName(root: ParentNode): Record<string, HTMLElement> {
  const elements: Record<string, HTMLElement> = {};
  for (const el of root.querySelectorAll<HTMLElement>(`[${ELEMENT_NAME_ATTR}]`)) {
    const name = el.getAttribute(ELEMENT_NAME_ATTR);
    if (name) elements[name] = el;
  }
  return elements;
}

export { tocCss, interactiveSelector, ELEMENT_NAME_ATTR, collectElementsByName };
