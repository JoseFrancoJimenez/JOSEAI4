import type { ButtonGroupChangeDetail, ButtonGroupElement, WidgetFloatingPanelElement } from '@mini/lib/widgets';

type Side = 'left' | 'right';

/**
 * Opens `panel` beside `anchor`, top-aligned with it and separated by 0.1em (resolved against the
 * anchor's own font size — `positionAt` takes px, so the em gap is converted once here rather than
 * baked into the widget). Width is only known once the panel is showing, so `show()` runs first
 * and the precise position is applied in the same synchronous task — the browser has nothing to
 * paint yet, so there is no visible jump from the default corner.
 *
 * `positionAt` coordinates are relative to the panel's offset parent, not the viewport (§6), so
 * the viewport rects below are translated into that space by subtracting the offset parent's own
 * rect — rather than hardcoding `#map`, so this keeps working if the panel is ever reparented.
 */
function openBeside(panel: WidgetFloatingPanelElement, anchor: ButtonGroupElement, side: Side): void {
  panel.show(anchor.activeButton ?? undefined);
  const gap = parseFloat(getComputedStyle(anchor).fontSize) * 0.1;
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const originRect = (panel.offsetParent ?? document.body).getBoundingClientRect();
  const x = side === 'right' ? anchorRect.right + gap : anchorRect.left - panelRect.width - gap;
  panel.positionAt(x - originRect.left, anchorRect.top - originRect.top);
}

/**
 * Wires a vertical corner rail to its panels: each button's `value` matches one panel's
 * `data-value`, and each panel opens on `side` of the rail (inward, toward the map — the left rail
 * opens right, the right rail opens left). Deselecting (value `null`, from clicking the active
 * button again) hides whichever panel is open — at most one can be, since every panel in the rail
 * shares the same `group` and `widget-floating-panel` already closes group siblings on open
 * (`docs/tasks/popover/widget-floating-panel-plan.md` §8).
 */
function wireCornerRail(railId: string, side: Side): void {
  const rail = document.getElementById(railId) as ButtonGroupElement;
  const panels = Array.from(document.querySelectorAll<WidgetFloatingPanelElement>(`widget-floating-panel[group="${railId}"]`));

  rail.addEventListener('widget-button-group:change', (ev) => {
    const { value } = (ev as CustomEvent<ButtonGroupChangeDetail>).detail;
    if (value === null) {
      panels.find((panel) => panel.open)?.hide();
      return;
    }
    openBeside(panels.find((panel) => panel.dataset.value === value)!, rail, side);
  });

  // A panel can close on its own (Escape, its close button) without the rail button ever being
  // clicked. `widget-floating-panel:toggle` fires only for that user-driven close — never for the
  // group auto-close `hide()` triggers when switching to a sibling panel (widget-floating-panel.ts
  // `#closeGroupSiblings`) — so checking `activeValue` still matches guards against clearing the
  // rail's just-selected button during that switch.
  for (const panel of panels) {
    panel.addEventListener('widget-floating-panel:toggle', (ev) => {
      const { open } = (ev as CustomEvent<{ open: boolean }>).detail;
      if (!open && rail.activeValue === panel.dataset.value) rail.setActive(null);
    });
  }
}

export { wireCornerRail };
