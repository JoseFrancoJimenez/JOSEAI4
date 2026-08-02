import { AppLayer, type BaseLayerEvents } from './baseLayer.ts';
import type { VectorLayerConfig, FieldConfig, VariableConfig, Legend } from './types.ts';

export interface VectorLayerEvents extends BaseLayerEvents {
  'change:variable': { variable: VariableConfig };
}

export class VectorAppLayer extends AppLayer<VectorLayerConfig, VectorLayerEvents> {
  #variable: VariableConfig | undefined;

  static override EVENTS = {
    ...AppLayer.EVENTS,
    CHANGE_VARIABLE: 'change:variable',
  } as const;

  constructor(config: VectorLayerConfig) {
    super(config);
    this.#variable = config.variables && config.default_variable
      ? VectorAppLayer.getVariable(config, config.default_variable)
      : undefined;
  }

  get fields(): FieldConfig[] { return this.config.fields; }

  get legend(): Legend {
    const defaultSubLabel = this.config.fields.find(f => f.id === this.#variable?.id)?.label ?? '';
    return {
      label: this.config.legend?.label ?? this.config.label,
      subLabel: this.config.legend?.subLabel ?? defaultSubLabel,
      items: this.#variable?.legend?.items ?? [],
    };
  }

  get variables(): VariableConfig[] { return this.config.variables ?? []; }

  get variable(): VariableConfig | undefined { return this.#variable; }

  setVariable(id: string): void {
    const variable = VectorAppLayer.getVariable(this.config, id);
    this.#variable = variable;
    this.emit('change:variable', { variable });
  }

  private static getVariable(config: VectorLayerConfig, id: string): VariableConfig {
    const variable = config.variables?.find(v => v.id === id);
    if (!variable) throw new Error(`Variable "${id}" not found in layer "${config.id}"`);
    return variable;
  }
}

