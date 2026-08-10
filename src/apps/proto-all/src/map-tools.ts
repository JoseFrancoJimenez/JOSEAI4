import type { ButtonGroupElement, WidgetFloatingPanelElement } from '@mini/lib/widgets';
import { clampTo } from './geometry.ts';

function buildFeatureBody(tool: string, x: number, y: number): DocumentFragment {
  const wrapper = document.createDocumentFragment();
  const text = document.createElement('span');
  text.textContent = `Tool: ${tool}`;
  const coords = document.createElement('span');
  coords.className = 'feature-coords';
  coords.textContent = `(${Math.round(x)}, ${Math.round(y)})`;
  wrapper.append(text, coords);
  return wrapper;
}

/**
 * Wires the map-tool `widget-button-group` (Pan/Select/Measure) and the click-to-open feature
 * popup. A click that started inside a corner rail (`.corner-tools`) or a floating panel
 * (`widget-floating-panel` — the panels are children of `#map`, its offset parent, so `positionAt`
 * resolves against it, §6) is ignored: those elements bubble their `click` up to `map` too, and
 * without this guard every rail click or in-panel click (e.g. the feature popup's own close
 * button) would also drop a feature popup under it.
 *
 * `featurePopover` is a child of `#map`, so `positionAt` takes coordinates relative to `#map`
 * itself, not the viewport — `clientX`/`clientY` are converted below.
 */
function wireMapTools(map: HTMLElement, tools: ButtonGroupElement, featurePopover: WidgetFloatingPanelElement): void {
  map.addEventListener('click', (ev) => {
    if ((ev.target as Element).closest('.corner-tools, widget-floating-panel')) return;

    const tool = tools.activeValue ?? 'pan';
    const mapRect = map.getBoundingClientRect();
    const x = ev.clientX - mapRect.left;
    const y = ev.clientY - mapRect.top;
    featurePopover.positionAt(x, y);
    featurePopover.show();
    featurePopover.setContent('default', buildFeatureBody(tool, x, y));

    // The popup's size is only known once it's rendered with this content (intrinsic width,
    // capped by index.html's CSS), so the clamp runs as a second positionAt right after — a click
    // near an edge would otherwise place the popup partly outside #map, invisible now that #map
    // clips (overflow: hidden). Boundary clamp only, never flips which corner it opened from.
    const panelRect = featurePopover.getBoundingClientRect();
    const clamped = clampTo(x, y, panelRect, mapRect);
    if (clamped.x !== x || clamped.y !== y) featurePopover.positionAt(clamped.x, clamped.y);
  });
}

export { wireMapTools };
