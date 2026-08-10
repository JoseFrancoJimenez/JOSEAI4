import type { NestedListElement, NestedListItem, NestedListLeaf, NestedListGroup, NestedListToggleDetail } from '@mini/lib/widgets';
import '@mini/lib/widgets';

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

// Five levels deep (Overlays → Utilities → Water → Supply → Main/Backup) to show indentation
// compounding across several levels, not just one.
const streets = layer('streets', 'Streets');
const satellite = layer('satellite', 'Satellite', false);
const parcels = layer('parcels', 'Parcels');
const zoning = layer('zoning', 'Zoning', false, 60);
const main = layer('main', 'Main');
const backup = layer('backup', 'Backup', false);
const drainage = layer('drainage', 'Drainage');
const power = layer('power', 'Power');
const supply = group('supply', 'Supply', [main, backup]);
const water = group('water', 'Water', [supply, drainage]);
const utilities = group('utilities', 'Utilities', [water, power]);

const initialItems: NestedListItem[] = [
  group('base-maps', 'Base Maps', [streets, satellite]),
  group('overlays', 'Overlays', [parcels, zoning, utilities]),
];

const layerState = new Map<string, Layer>();
function rememberLayer(l: Layer): void {
  layerState.set(l.id, l);
}
initialItems.forEach(function walk(item: NestedListItem): void {
  if ('children' in item) item.children.forEach(walk);
  else rememberLayer(item as Layer);
});

// Real interactive controls in extras — exercises the disclosure-list exception that allows
// nodes (not just strings) in per-item content, and lets the manual screen-reader pass confirm
// clicking them never toggles the group/leaf underneath (accessibility §3.2).
function renderLeaf(item: NestedListLeaf): Node {
  const l = layerState.get(item.id)!;
  const wrapper = document.createElement('span');
  wrapper.className = 'layer-extras';

  const visibility = document.createElement('input');
  visibility.type = 'checkbox';
  visibility.checked = l.visible;
  visibility.setAttribute('aria-label', `${l.label} visible`);
  visibility.addEventListener('change', () => { l.visible = visibility.checked; });

  const opacity = document.createElement('input');
  opacity.type = 'range';
  opacity.min = '0';
  opacity.max = '100';
  opacity.value = String(l.opacity);
  opacity.setAttribute('aria-label', `${l.label} opacity`);
  opacity.addEventListener('input', () => { l.opacity = Number(opacity.value); });

  wrapper.append(visibility, opacity);
  return wrapper;
}

function renderGroup(g: NestedListGroup): string {
  return `${g.children.length} layers`;
}

const list = document.getElementById('layers') as NestedListElement;
list.setup({
  items: initialItems,
  renderLeaf,
  renderGroup,
  expanded: ['base-maps', 'overlays', 'utilities', 'water', 'supply'],
});

const log = document.getElementById('event-log')!;
list.addEventListener('widget-nested-list:toggle', (ev) => {
  const { id, expanded } = (ev as CustomEvent<NestedListToggleDetail>).detail;
  log.textContent = `toggle ${id} → ${expanded ? 'expanded' : 'collapsed'}\n${log.textContent}`;
});

document.getElementById('expand-utilities')!.addEventListener('click', () => list.expand('utilities'));
document.getElementById('collapse-utilities')!.addEventListener('click', () => list.collapse('utilities'));

// Demonstrates the surgical setItems diff: reorders Overlays' children (Utilities moves to the
// top) and renames Zoning — the widget only diffs a leaf by id+label, so a label change is what
// triggers its extras to be re-invoked (reading the flipped visibility below); every other node,
// including everything nested under Utilities, keeps its exact DOM identity, just repositioned.
document.getElementById('reorder')!.addEventListener('click', () => {
  zoning.visible = !zoning.visible;
  zoning.label = zoning.label === 'Zoning' ? 'Zoning ⚡' : 'Zoning';

  const reordered: NestedListItem[] = [
    initialItems[0]!,
    group('overlays', 'Overlays', [utilities, layer(zoning.id, zoning.label), parcels]),
  ];
  list.setItems(reordered);
});

console.log('widget-nested-list demo booted');
