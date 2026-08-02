import Evented from '../../core/evented.ts';
import type { BaseLayerConfig, Legend } from './types.ts';

export interface BaseLayerEvents {
  'change:visible': { visible: boolean };
  'change:opacity': { opacity: number };
}

export abstract class AppLayer<
  TConfig extends BaseLayerConfig = BaseLayerConfig,
  TEvents extends BaseLayerEvents = BaseLayerEvents,
> extends Evented<TEvents> {
  protected readonly config: TConfig;
  #visible: boolean;
  #opacity: number;

  static EVENTS = {
    CHANGE_VISIBLE: 'change:visible',
    CHANGE_OPACITY: 'change:opacity',
  } as const;

  constructor(config: TConfig) {
    super();
    this.config = config;
    this.#visible = config.visible ?? true;
    this.#opacity = config.opacity ?? 1;
  }

  get id(): string { return this.config.id; }
  get label(): string { return this.config.label; }

  get visible(): boolean { return this.#visible; }
  set visible(value: boolean) {
    this.#visible = value;
    this.emit('change:visible', { visible: value } as TEvents['change:visible']);
  }

  get opacity(): number { return this.#opacity; }
  set opacity(value: number) {
    this.#opacity = value;
    this.emit('change:opacity', { opacity: value } as TEvents['change:opacity']);
  }

  get legend(): Legend {
    return {
      label: this.config.legend?.label ?? this.config.label,
      subLabel: this.config.legend?.subLabel ?? '',
      items: this.config.legend?.items ?? [],
    };
  }
}
