import Overlay from 'ol/Overlay.js';
import { fromLonLat } from 'ol/proj.js';
import type { OLMap } from './openLayers.ts';

/** Widget-facing handle over an `ol/Overlay` — positions are lon/lat, `null` hides. */
export interface OverlayHandle {
  setPosition(lonLat: [number, number] | null): void;
  destroy(): void;
}

export function createOverlay(
  map: OLMap,
  element: HTMLElement,
  opts?: { offset?: [number, number] },
): OverlayHandle {
  const overlay = new Overlay({
    element,
    offset: opts?.offset,
    positioning: 'bottom-center',
    stopEvent: true,
  });
  map.addOverlay(overlay);

  return {
    setPosition(lonLat: [number, number] | null): void {
      overlay.setPosition(
        lonLat ? fromLonLat(lonLat, map.getView().getProjection()) : undefined,
      );
    },
    destroy(): void {
      map.removeOverlay(overlay);
    },
  };
}
