import type { WidgetPopoverElement } from '@mini/lib/widgets';
import '@mini/lib/widgets';
import '@mini/lib/elements';
import '@fortawesome/fontawesome-free/css/all.min.css';

function wire(buttonId: string, popover: WidgetPopoverElement): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  button.addEventListener('click', () => popover.toggle(button));
}

const popoverToolsA = document.getElementById('popover-tools-a') as WidgetPopoverElement;
const popoverToolsB = document.getElementById('popover-tools-b') as WidgetPopoverElement;
const popoverInfo = document.getElementById('popover-info') as WidgetPopoverElement;
const popoverUngrouped = document.getElementById('popover-ungrouped') as WidgetPopoverElement;
const popoverHeaderless = document.getElementById('popover-headerless') as WidgetPopoverElement;
const popoverTimer = document.getElementById('popover-timer') as WidgetPopoverElement;
const popoverTypo = document.getElementById('popover-typo') as WidgetPopoverElement;
const popoverFeature = document.getElementById('popover-feature') as WidgetPopoverElement;

wire('btn-tools-a', popoverToolsA);
wire('btn-tools-b', popoverToolsB);
wire('btn-info', popoverInfo);
wire('btn-ungrouped', popoverUngrouped);
wire('btn-headerless', popoverHeaderless);
wire('btn-timer', popoverTimer);
wire('btn-typo', popoverTypo);

// Body updated on a timer while open, to watch the live region announce (§6: show() first, then setContent).
let timerHandle: ReturnType<typeof setInterval> | undefined;
popoverTimer.addEventListener('toggle', (ev) => {
  const { newState } = ev;
  if (newState === 'open') {
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

// Feature popup: no static class, no trigger button — placed entirely by the click point (§4, §7).
// Containing it within the #map div (rather than just the viewport) is app-level: the widget only
// knows viewport coordinates, and has no notion of "the map" to clamp against on its own.
const map = document.getElementById('map')!;
map.addEventListener('click', (ev) => {
  popoverFeature.positionAt(ev.clientX, ev.clientY);
  popoverFeature.show();
  popoverFeature.setContent('default', `Feature at (${Math.round(ev.clientX)}, ${Math.round(ev.clientY)})`);

  const mapRect = map.getBoundingClientRect();
  const popRect = popoverFeature.getBoundingClientRect();
  const clampedX = Math.min(ev.clientX, Math.max(mapRect.left, mapRect.right - popRect.width));
  const clampedY = Math.min(ev.clientY, Math.max(mapRect.top, mapRect.bottom - popRect.height));
  popoverFeature.positionAt(clampedX, clampedY);
});

console.log('widget-popover demo booted');
