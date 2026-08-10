import type {
  ButtonGroupChangeDetail,
  ButtonGroupElement,
  NestedListElement,
  NestedListGroup,
  NestedListItem,
  NestedListLeaf,
  WidgetPopoverElement,
} from '@mini/lib/widgets';
import '@mini/lib/widgets';
import '@mini/lib/elements';
import '@fortawesome/fontawesome-free/css/all.min.css';

interface Layer extends NestedListLeaf {
  visible: boolean;
  opacity: number;
}

function layer(id: string, label: string, visible = true, opacity = 100): Layer {
  return { id, label, visible, opacity };
}

function group(id: string, label: string, children: NestedListItem[]): NestedListGroup {
  return { id, label, children };
}

const layerState = new Map<string, Layer>();
function rememberLayer(l: Layer): void {
  layerState.set(l.id, l);
}

const roads = layer('roads', 'Roads');
const parcels = layer('parcels', 'Parcels');
const hydro = layer('hydro', 'Hydrography', false, 70);
const zoning = layer('zoning', 'Zoning', false);

// Nested several levels deep (Overlays → Utilities → Water → Supply → Main/Backup) to show
// indentation compounding across levels, not just one.
const main = layer('main', 'Main');
const backup = layer('backup', 'Backup', false);
const drainage = layer('drainage', 'Drainage');
const power = layer('power', 'Power');
const supply = group('supply', 'Supply', [main, backup]);
const water = group('water', 'Water', [supply, drainage]);
const utilities = group('utilities', 'Utilities', [water, power]);

const items: NestedListItem[] = [
  group('base', 'Base Maps', [roads, layer('satellite', 'Satellite', false)]),
  group('overlays', 'Overlays', [parcels, hydro, zoning, utilities]),
];
items.forEach(function walk(item: NestedListItem): void {
  if ('children' in item) item.children.forEach(walk);
  else rememberLayer(item as Layer);
});

// Real interactive controls in extras — same disclosure-list exception used in the standalone
// nested-list demo: nodes (not just strings) are allowed here because rows are not composite
// widget items with a roving tabindex (docs/accessibility.md §3.2).
function renderLeaf(item: NestedListLeaf): Node {
  const l = layerState.get(item.id)!;
  const wrapper = document.createElement('span');
  wrapper.className = 'layer-extras';

  const visibility = document.createElement('input');
  visibility.type = 'checkbox';
  visibility.checked = l.visible;
  visibility.setAttribute('aria-label', `${l.label} visible`);
  visibility.addEventListener('change', () => {
    l.visible = visibility.checked;
  });

  const opacity = document.createElement('input');
  opacity.type = 'range';
  opacity.min = '0';
  opacity.max = '100';
  opacity.value = String(l.opacity);
  opacity.setAttribute('aria-label', `${l.label} opacity`);
  opacity.addEventListener('input', () => {
    l.opacity = Number(opacity.value);
  });

  wrapper.append(visibility, opacity);
  return wrapper;
}

const layersList = document.getElementById('layers-list') as NestedListElement;
layersList.setup({ items, renderLeaf, expanded: [] });

// Tool selection: widget-button-group already reflects the active tool and emits on click —
// nothing further to wire beyond reading its value when a feature popup is opened below.
const tools = document.getElementById('tools') as ButtonGroupElement;

const featurePopover = document.getElementById('feature-popover') as WidgetPopoverElement;
const map = document.getElementById('map')!;

/**
 * Pulls a `size`-sized box at (`x`, `y`) back inside `container` — same idea as the feature
 * popup's viewport clamp, but against the map's own bounds rather than the viewport, and used by
 * every overlay this proto opens so "restricted to the map" means one function, not three copies.
 */
function clampToContainer(x: number, y: number, size: { width: number; height: number }, container: DOMRect): { x: number; y: number } {
  const maxX = Math.max(container.left, container.right - size.width);
  const maxY = Math.max(container.top, container.bottom - size.height);
  return {
    x: Math.min(Math.max(x, container.left), maxX),
    y: Math.min(Math.max(y, container.top), maxY),
  };
}

/**
 * Opens `panel` beside `anchor`, top-aligned with it and separated by 0.1em (resolved against the
 * anchor's own font size — `positionAt` takes px, so the em gap is converted once here rather than
 * baked into the widget), then clamped inside the map the same way the feature popup is. Width is
 * only known once the popover is showing, so `show()` runs first and the precise position is
 * applied in the same synchronous task — the browser has nothing to paint yet, so there is no
 * visible jump from the default corner.
 */
function openBeside(panel: WidgetPopoverElement, anchor: ButtonGroupElement, side: 'left' | 'right'): void {
  panel.show(anchor.activeButton ?? undefined);
  const gap = parseFloat(getComputedStyle(anchor).fontSize) * 0.1;
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const rawX = side === 'right' ? anchorRect.right + gap : anchorRect.left - panelRect.width - gap;

  const { x, y } = clampToContainer(rawX, anchorRect.top, panelRect, map.getBoundingClientRect());
  panel.positionAt(x, y);
}

/**
 * Wires a vertical corner rail to its panels: each button's `value` matches one panel's
 * `data-value`, and each panel opens on `side` of the rail (inward, toward the map — the left
 * rail opens right, the right rail opens left). Deselecting (value `null`, from clicking the
 * active button again) hides whichever panel is open — at most one can be, since every panel in
 * the rail shares the same `group` and `widget-popover` already closes group siblings on open
 * (`docs/tasks/popover/pop-over.md` §5).
 */
function wireCornerRail(railId: string, side: 'left' | 'right'): void {
  const rail = document.getElementById(railId) as ButtonGroupElement;
  const panels = Array.from(document.querySelectorAll<WidgetPopoverElement>(`widget-popover[group="${railId}"]`));

  rail.addEventListener('widget-button-group:change', (ev) => {
    const { value } = (ev as CustomEvent<ButtonGroupChangeDetail>).detail;
    if (value === null) {
      panels.find((panel) => panel.open)?.hide();
      return;
    }
    openBeside(panels.find((panel) => panel.dataset.value === value)!, rail, side);
  });
}

wireCornerRail('left-tools', 'right');
wireCornerRail('right-tools', 'left');

// The corner rails sit inside #map, so a click on one of their buttons bubbles up here too — skip
// it, or every rail click would also drop a feature popup under the button.
map.addEventListener('click', (ev) => {
  if ((ev.target as Element).closest('.corner-tools')) return;

  const tool = tools.activeValue ?? 'pan';
  featurePopover.positionAt(ev.clientX, ev.clientY);
  featurePopover.show();
  featurePopover.setContent(
    'default',
    (() => {
      const wrapper = document.createDocumentFragment();
      const text = document.createElement('span');
      text.textContent = `Tool: ${tool}`;
      const coords = document.createElement('span');
      coords.className = 'feature-coords';
      coords.textContent = `(${Math.round(ev.clientX)}, ${Math.round(ev.clientY)})`;
      wrapper.append(text, coords);
      return wrapper;
    })(),
  );

  const { x, y } = clampToContainer(ev.clientX, ev.clientY, featurePopover.getBoundingClientRect(), map.getBoundingClientRect());
  featurePopover.positionAt(x, y);
});

console.log('proto booted');
