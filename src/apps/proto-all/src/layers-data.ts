import type { NestedListGroup, NestedListItem, NestedListLeaf } from '@mini/lib/widgets';

interface Layer extends NestedListLeaf {
  visible: boolean;
  opacity: number;
}

interface LayerTree {
  items: NestedListItem[];
  layerState: Map<string, Layer>;
}

function layer(id: string, label: string, visible = true, opacity = 100): Layer {
  return { id, label, visible, opacity };
}

function group(id: string, label: string, children: NestedListItem[]): NestedListGroup {
  return { id, label, children };
}

function isGroup(item: NestedListItem): item is NestedListGroup {
  return 'children' in item;
}

/**
 * Nested several levels deep (Overlays → Utilities → Water → Supply → Main/Backup) to show
 * indentation compounding across levels, not just one. `layerState` is the extras' own read/write
 * model — `widget-nested-list` owns nothing but the tree shape and expansion.
 */
function buildLayerTree(): LayerTree {
  const roads = layer('roads', 'Roads');
  const parcels = layer('parcels', 'Parcels');
  const hydro = layer('hydro', 'Hydrography', false, 70);
  const zoning = layer('zoning', 'Zoning', false);

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

  const layerState = new Map<string, Layer>();
  items.forEach(function walk(item: NestedListItem): void {
    if (isGroup(item)) item.children.forEach(walk);
    else layerState.set(item.id, item as Layer);
  });

  return { items, layerState };
}

export { buildLayerTree };
export type { Layer, LayerTree };
