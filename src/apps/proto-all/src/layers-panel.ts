import type { NestedListElement, NestedListLeaf } from '@mini/lib/widgets';
import type { Layer, LayerTree } from './layers-data.ts';

/**
 * Real interactive controls in extras — the disclosure-list exception that allows nodes (not just
 * strings) in per-item content, since rows here are not composite-widget items with a roving
 * tabindex (docs/accessibility.md §3.2).
 */
function renderLeaf(layerState: Map<string, Layer>): (item: NestedListLeaf) => Node {
  return (item) => {
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
  };
}

/** Starts fully collapsed (`expanded: []`) — the tree earns its indentation levels on click. */
function setupLayersPanel(list: NestedListElement, tree: LayerTree): void {
  list.setup({
    items: tree.items,
    renderLeaf: renderLeaf(tree.layerState),
    expanded: [],
  });
}

export { setupLayersPanel };
