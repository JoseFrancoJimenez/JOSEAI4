import type { ButtonGroupElement, WidgetPopoverElement } from '@mini/lib/widgets';

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
 * popup. `featurePopover.clampTo` is set once, here, so every future `show()`/`positionAt()` is
 * restricted to the map's own bounds — no per-open clamping left to do. A click that started
 * inside a corner rail (`.corner-tools`) is ignored: those buttons bubble their `click` up to
 * `map` too, and without this guard every rail click would also drop a feature popup under it.
 */
function wireMapTools(map: HTMLElement, tools: ButtonGroupElement, featurePopover: WidgetPopoverElement): void {
  featurePopover.clampTo = map;

  map.addEventListener('click', (ev) => {
    if ((ev.target as Element).closest('.corner-tools')) return;

    const tool = tools.activeValue ?? 'pan';
    featurePopover.positionAt(ev.clientX, ev.clientY);
    featurePopover.show();
    featurePopover.setContent('default', buildFeatureBody(tool, ev.clientX, ev.clientY));
  });
}

export { wireMapTools };
