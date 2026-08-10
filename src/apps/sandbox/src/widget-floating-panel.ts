import type { WidgetFloatingPanelElement } from '@mini/lib/widgets';
import '@mini/lib/widgets';
import '@mini/lib/elements';
import '@fortawesome/fontawesome-free/css/all.min.css';

function wire(buttonId: string, popover: WidgetFloatingPanelElement): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  button.addEventListener('click', () => popover.toggle(button));
}

const popoverToolsA = document.getElementById('popover-tools-a') as WidgetFloatingPanelElement;
const popoverToolsB = document.getElementById('popover-tools-b') as WidgetFloatingPanelElement;
const popoverInfo = document.getElementById('popover-info') as WidgetFloatingPanelElement;
const popoverUngrouped = document.getElementById('popover-ungrouped') as WidgetFloatingPanelElement;
const popoverHeaderless = document.getElementById('popover-headerless') as WidgetFloatingPanelElement;
const popoverTimer = document.getElementById('popover-timer') as WidgetFloatingPanelElement;
const popoverTypo = document.getElementById('popover-typo') as WidgetFloatingPanelElement;
const popoverFeature = document.getElementById('popover-feature') as WidgetFloatingPanelElement;

wire('btn-tools-a', popoverToolsA);
wire('btn-tools-b', popoverToolsB);
wire('btn-info', popoverInfo);
wire('btn-ungrouped', popoverUngrouped);
wire('btn-headerless', popoverHeaderless);
wire('btn-timer', popoverTimer);
wire('btn-typo', popoverTypo);

// Body updated on a timer while open, to watch the live region announce (§6: show() first, then setContent).
let timerHandle: ReturnType<typeof setInterval> | undefined;
popoverTimer.addEventListener('widget-floating-panel:toggle', (ev) => {
  const { open } = (ev as CustomEvent<{ open: boolean }>).detail;
  if (open) {
    let count = 0;
    popoverTimer.setContent('default', `Updated ${count} times.`);
    timerHandle = setInterval(() => {
      count += 1;
      popoverTimer.setContent('default', `Updated ${count} times.`);
    }, 2000);
  } else {
    clearInterval(timerHandle);
  }
});

// Feature popup: no static class, no trigger button — placed entirely by the click point (§6).
// popoverFeature is a child of #map (its offset parent), so positionAt takes coordinates relative
// to #map itself, not the viewport (§6 contract change) — no clamping needed here: #map clips via
// `overflow: hidden` (toggled below) or lets the panel spill via `overflow: visible`, the consumer's
// call (§10), not the widget's.
const map = document.getElementById('map')!;
map.addEventListener('click', (ev) => {
  if ((ev.target as Element).closest('widget-floating-panel, .map-control')) return;

  const mapRect = map.getBoundingClientRect();
  const x = ev.clientX - mapRect.left;
  const y = ev.clientY - mapRect.top;
  popoverFeature.positionAt(x, y);
  popoverFeature.show();
  popoverFeature.setContent('default', `Feature at (${Math.round(x)}, ${Math.round(y)})`);
});

// Manual test of §10's "overflow: hidden clips, visible does not" — pure demo wiring, not part of the widget.
const clipToggle = document.getElementById('clip-toggle') as HTMLInputElement;
clipToggle.addEventListener('change', () => {
  map.classList.toggle('clip-off', !clipToggle.checked);
});

console.log('widget-floating-panel demo booted');
