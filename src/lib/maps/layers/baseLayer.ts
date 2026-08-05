import type { BaseLayerConfig, Legend } from './types.ts';
import type { GisStore } from '../state/gisStore.ts';
import { layerOpacitySet, layerRegistered, layerVisibilitySet, type LayerRuntimeState } from '../state/layers.slice.ts';
import { selectLayerState } from '../state/selectors.ts';

/**
 * Read/command facade over a layer config + the layers slice (ADR-3). Holds no
 * runtime state of its own and emits no events — subscribers observe the
 * store; the binder inside AppMap applies store state to the native layer.
 *
 * AppLayers have a life independent of any map: the constructor registers the
 * layer's runtime state (a no-op when the id is already registered, so
 * pre-seeded or hydrated state wins), and the state survives
 * `AppMap.removeLayer`. Discard it explicitly with a `layerUnregistered`
 * dispatch when a layer is gone for good.
 */
export abstract class AppLayer<TConfig extends BaseLayerConfig = BaseLayerConfig> {
  readonly #config: TConfig;
  protected readonly store: GisStore;

  constructor(config: TConfig, store: GisStore) {
    this.#config = config;
    this.store = store;
    store.dispatch(layerRegistered(config.id, this.initialRuntimeState()));
  }

  /**
   * The raw layer config. Public ONLY for the OpenLayers boundary —
   * `AppMap.addLayer` builds the paired native OL layer from it. Widgets and
   * app code must use the curated getters (`id`/`label`/`legend`/`fields`/…)
   * instead: reading raw config couples callers to config shape and bypasses
   * the facade. Enforced via ESLint `no-restricted-properties` for
   * `src/lib/widgets/**` and `src/app/**`.
   */
  get config(): TConfig { return this.#config; }

  /** Runtime state registered at construction; subclasses extend (e.g. default variable). */
  protected initialRuntimeState(): LayerRuntimeState {
    return {
      visible: this.#config.visible ?? true,
      opacity: this.#config.opacity ?? 1,
    };
  }

  get id(): string { return this.#config.id; }
  get label(): string { return this.#config.label; }
  get idField(): string | undefined { return this.#config.idField; }

  get visible(): boolean {
    return selectLayerState(this.store.getState(), this.id)?.visible ?? true;
  }
  set visible(value: boolean) {
    this.store.dispatch(layerVisibilitySet(this.id, value));
  }

  get opacity(): number {
    return selectLayerState(this.store.getState(), this.id)?.opacity ?? 1;
  }
  set opacity(value: number) {
    this.store.dispatch(layerOpacitySet(this.id, value));
  }

  get legend(): Legend {
    return {
      label: this.#config.legend?.label ?? this.#config.label,
      subLabel: this.#config.legend?.subLabel ?? '',
      items: this.#config.legend?.items ?? [],
    };
  }
}
