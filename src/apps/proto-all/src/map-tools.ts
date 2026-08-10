import type { ButtonGroupElement, WidgetFloatingPanelElement } from '@mini/lib/widgets';

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
 * popup. A click that started inside a corner rail (`.corner-tools`) is ignored: those buttons
 * bubble their `click` up to `map` too, and without this guard every rail click would also drop
 * a feature popup under it.
 *
 * NOTE: `positionAt` coordinates are now relative to the panel's offset parent, not the viewport
 * (`docs/tasks/popover/widget-floating-panel-plan.md` §6) — `featurePopover` is still placed
 * outside `#map` in `index.html`, so passing raw `clientX`/`clientY` here no longer lands where
 * it visually should. Left as-is pending a decision on repositioning it inside `#map` and
 * converting these to container-relative coordinates.
 */
function wireMapTools(map: HTMLElement, tools: ButtonGroupElement, featurePopover: WidgetFloatingPanelElement): void {
  map.addEventListener('click', (ev) => {
    if ((ev.target as Element).closest('.corner-tools')) return;

    const tool = tools.activeValue ?? 'pan';
    featurePopover.positionAt(ev.clientX, ev.clientY);
    featurePopover.show();
    featurePopover.setContent('default', buildFeatureBody(tool, ev.clientX, ev.clientY));
  });
}

export { wireMapTools };
