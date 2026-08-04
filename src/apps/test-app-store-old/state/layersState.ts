import Evented from '../../lib/core/evented.ts';
import type { Subscription } from '../../lib/core/evented.ts';
import type { AppLayer } from '../../lib/maps/layers/baseLayer.ts';
import { VectorAppLayer } from '../../lib/maps/layers/vectorLayer.ts';
import type { FieldConfig } from '../../lib/maps/layers/types.ts';

/** Event map for {@link LayersState}. */
export interface ILayersStateEvents {
  'change:visible': { id: string; visible: boolean };
  'change:opacity': { id: string; opacity: number };
}

/**
 * The read-only, presentation-facing view of one layer: just what a widget needs
 * to list and label it (and, for a feature table, its columns) — never the mutable
 * {@link AppLayer} itself. `fields` is empty for layers that have none.
 */
export interface LayerDescriptor {
  id: string;
  label: string;
  fields: FieldConfig[];
}

/**
 * The app's layer state as a whole: owns the {@link AppLayer} instances (each the
 * durable state of one layer — visibility, opacity, active variable/legend) and
 * exposes them as a collection. It is the single source of truth for layer
 * visibility across the app, replacing the old per-id CheckState.
 *
 * Per-layer changes are re-emitted as collection events (`change:visible`,
 * `change:opacity`) carrying the layer id, so a view can subscribe once and react
 * to any layer. Extends {@link Evented}.
 */
export class LayersState extends Evented<ILayersStateEvents> {
  readonly #layers = new Map<string, AppLayer>();
  readonly #subscriptions: Subscription[] = [];

  /** @param layers - The layer state objects to own, in render order. */
  constructor(layers: Iterable<AppLayer> = []) {
    super();
    for (const layer of layers) {
      this.#layers.set(layer.id, layer);
      this.#subscriptions.push(
        layer.on('change:visible', ({ visible }) => this.emit('change:visible', { id: layer.id, visible })),
        layer.on('change:opacity', ({ opacity }) => this.emit('change:opacity', { id: layer.id, opacity })),
      );
    }
  }

  /** Returns the layer state registered under `id`, or `undefined` if not found. */
  getLayer(id: string): AppLayer | undefined {
    return this.#layers.get(id);
  }

  /** Returns all layer state objects in render order. */
  getLayers(): AppLayer[] {
    return [...this.#layers.values()];
  }

  /**
   * Returns a lightweight {@link LayerDescriptor} per layer, in render order, so
   * widgets can list/label layers (and read a table's columns) without touching the
   * mutable {@link AppLayer} objects. Read-only view — mutate visibility through
   * {@link setVisible}.
   */
  descriptors(): LayerDescriptor[] {
    return this.getLayers().map(layer => ({
      id: layer.id,
      label: layer.label,
      fields: layer instanceof VectorAppLayer ? layer.fields : [],
    }));
  }

  /** Returns whether `id` is visible. Unknown ids are treated as not visible. */
  isVisible(id: string): boolean {
    return this.#layers.get(id)?.visible ?? false;
  }

  /** Returns the ids of the layers that are currently visible, in render order. */
  visibleIds(): string[] {
    return this.getLayers().filter(layer => layer.visible).map(layer => layer.id);
  }

  /** Sets the visibility of `id`. No-op if the id is unknown. Fires `change:visible`. */
  setVisible(id: string, visible: boolean): void {
    const layer = this.#layers.get(id);
    if (layer) layer.visible = visible;
  }

  /** Sets every layer to `visible`, firing `change:visible` per layer. */
  setAllVisible(visible: boolean): void {
    for (const layer of this.#layers.values()) layer.visible = visible;
  }

  /** Detaches from the owned layers. Call when discarding the store. */
  dispose(): void {
    this.#subscriptions.forEach(s => s.remove());
    this.#subscriptions.length = 0;
  }
}
