import type { ButtonGroupElement, NestedListElement, WidgetPopoverElement } from '@mini/lib/widgets';
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
const featurePopover = document.getElementById('feature-popover') as WidgetPopoverElement;
wireMapTools(map, tools, featurePopover);

wireCornerRail('left-tools', 'right', map);
wireCornerRail('right-tools', 'left', map);

console.log('proto-all booted');
