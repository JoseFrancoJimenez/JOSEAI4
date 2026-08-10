import type { ButtonGroupChangeDetail, ButtonGroupElement, WidgetPopoverElement } from '@mini/lib/widgets';

type Side = 'left' | 'right';

/**
 * Opens `panel` beside `anchor`, top-aligned with it and separated by 0.1em (resolved against the
 * anchor's own font size — `positionAt` takes px, so the em gap is converted once here rather than
 * baked into the widget). Width is only known once the popover is showing, so `show()` runs first
 * and the precise position is applied in the same synchronous task — the browser has nothing to
 * paint yet, so there is no visible jump from the default corner. `positionAt` re-clamps itself
 * against `panel.clampTo` since the panel is already open at that point (`widget-popover.ts`), so
 * there is nothing left to do here to keep it inside the map.
 */
function openBeside(panel: WidgetPopoverElement, anchor: ButtonGroupElement, side: Side): void {
  panel.show(anchor.activeButton ?? undefined);
  const gap = parseFloat(getComputedStyle(anchor).fontSize) * 0.1;
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const x = side === 'right' ? anchorRect.right + gap : anchorRect.left - panelRect.width - gap;
  panel.positionAt(x, anchorRect.top);
}

/**
 * Wires a vertical corner rail to its panels: each button's `value` matches one panel's
 * `data-value`, and each panel opens on `side` of the rail (inward, toward the map — the left rail
 * opens right, the right rail opens left). Each panel's `clampTo` is set once, here, to `container`
 * — after that every `openBeside` call stays inside it for free. Deselecting (value `null`, from
 * clicking the active button again) hides whichever panel is open — at most one can be, since
 * every panel in the rail shares the same `group` and `widget-popover` already closes group
 * siblings on open (`docs/tasks/popover/pop-over.md` §5).
 */
function wireCornerRail(railId: string, side: Side, container: HTMLElement): void {
  const rail = document.getElementById(railId) as ButtonGroupElement;
  const panels = Array.from(document.querySelectorAll<WidgetPopoverElement>(`widget-popover[group="${railId}"]`));
  for (const panel of panels) panel.clampTo = container;

  rail.addEventListener('widget-button-group:change', (ev) => {
    const { value } = (ev as CustomEvent<ButtonGroupChangeDetail>).detail;
    if (value === null) {
      panels.find((panel) => panel.open)?.hide();
      return;
    }
    openBeside(panels.find((panel) => panel.dataset.value === value)!, rail, side);
  });
}

export { wireCornerRail };
