import { AppLayer } from './baseLayer.ts';
import type { VectorLayerConfig, FieldConfig, VariableConfig, Legend } from './types.ts';
import type { GisStore } from '../state/gisStore.ts';
import { layerVariableSet, type LayerRuntimeState } from '../state/layers.slice.ts';
import { selectLayerState } from '../state/selectors.ts';

export class VectorAppLayer extends AppLayer<VectorLayerConfig> {
  constructor(config: VectorLayerConfig, store: GisStore) {
    super(config, store);
  }

  protected override initialRuntimeState(): LayerRuntimeState {
    return { ...super.initialRuntimeState(), variableId: this.config.default_variable };
  }

  get fields(): FieldConfig[] { return this.config.fields; }

  get variables(): VariableConfig[] { return this.config.variables ?? []; }

  /** The currently active variable per the store, or `undefined` when none is set. */
  get variable(): VariableConfig | undefined {
    const variableId = selectLayerState(this.store.getState(), this.id)?.variableId;
    return variableId !== undefined
      ? this.config.variables?.find(v => v.id === variableId)
      : undefined;
  }

  get legend(): Legend {
    const variable = this.variable;
    const defaultSubLabel = this.config.fields.find(f => f.id === variable?.id)?.label ?? '';
    return {
      label: this.config.legend?.label ?? this.config.label,
      subLabel: this.config.legend?.subLabel ?? defaultSubLabel,
      items: variable?.legend?.items ?? [],
    };
  }

  /** Validates `id` against the config, then dispatches to the store. */
  setVariable(id: string): void {
    VectorAppLayer.getVariable(this.config, id);
    this.store.dispatch(layerVariableSet(this.id, id));
  }

  /**
   * Resolves a variable id to its config (for the AppMap binder).
   * @throws {Error} If the variable is not defined on this layer.
   */
  resolveVariable(variableId: string): VariableConfig {
    return VectorAppLayer.getVariable(this.config, variableId);
  }

  private static getVariable(config: VectorLayerConfig, id: string): VariableConfig {
    const variable = config.variables?.find(v => v.id === id);
    if (!variable) throw new Error(`Variable "${id}" not found in layer "${config.id}"`);
    return variable;
  }
}
