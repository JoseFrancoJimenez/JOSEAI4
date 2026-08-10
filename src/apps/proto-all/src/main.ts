import type { ButtonGroupElement, NestedListElement, WidgetFloatingPanelElement } from '@mini/lib/widgets';
import '@mini/lib/widgets';
import '@mini/lib/elements';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { buildLayerTree } from './layers-data.ts';
import { setupLayersPanel } from './layers-panel.ts';
import { wireMapTools } from './map-tools.ts';
import { wireCornerRail } from './corner-rail.ts';

const layersList = document.getElementById('layers-list') as NestedListElement;
setupLayersPanel(layersList, buildLayerTree());

const map = document.getElementById('map')!;
const tools = document.getElementById('tools') as ButtonGroupElement;
const featurePopover = document.getElementById('feature-popover') as WidgetFloatingPanelElement;
wireMapTools(map, tools, featurePopover);

wireCornerRail('left-tools', 'right');
wireCornerRail('right-tools', 'left');

// The popup is positioned from click coordinates relative to #map at open time (map-tools.ts);
// if #map itself resizes while it's open, those coordinates go stale. Closing rather than
// re-clamping avoids tracking the originally requested x/y just to dodge clamp drift on repeated
// resizes (docs/tasks/popover/widget-floating-panel-plan.md §14).
window.addEventListener('resize', () => featurePopover.hide());

console.log('proto-all booted');
