import './layer-toc.css';
import { TocComponent } from '../../../lib/widgets/toc/toc.ts';
import type { ITocChangeDetail } from '../../../lib/widgets/toc/toc.ts';
import { TocModel } from '../../../lib/widgets/toc/toc-model.ts';
import type { ITocNode, ITocNodeDef } from '../../../lib/widgets/toc/toc.types.ts';
import type { Subscription } from '../../../lib/core/evented.ts';
import type { LayersState, TocState } from '../../state/index.ts';

// Id of the single group node that holds the layer leaves.
const GROUP_ID = 'Map Layers';

/** The minimum a layer contributes to the toc: an id and a display label. */
export interface TocLayer {
  id: string;
  label: string;
}

/**
 * Builds the toc model — a single "Map Layers" group with one leaf per layer — and
 * the id → label map {@link LayerToc} renders names from.
 */
export function buildLayerToc(layers: TocLayer[]): { model: TocModel; labels: Map<string, string> } {
  const defs: ITocNodeDef[] = [
    { id: GROUP_ID, parent_id: null, type: 'group' },
    ...layers.map(layer => ({ id: layer.id, parent_id: GROUP_ID, type: 'layer' })),
  ];
  const labels = new Map<string, string>([
    [GROUP_ID, GROUP_ID],
    ...layers.map(layer => [layer.id, layer.label] as [string, string]),
  ]);
  return { model: new TocModel(defs), labels };
}

/**
 * The app's table-of-contents: wraps the generic {@link TocComponent} from the lib
 * and adds everything app-specific — a leaf renderer with a visibility checkbox,
 * two-way sync with {@link TocState} (the store drives the tree; toc clicks
 * report back), and a one-way mirror of {@link LayersState} visibility onto the
 * checkboxes. The composition root just builds the model/stores and calls
 * {@link setup}; all the toc wiring lives here.
 */
class LayerToc extends HTMLElement {
  /** Custom element tag name. */
  static readonly tagName = 'layer-toc';

  /** CSS class names used by the leaf renderer (checkbox reuses the lib's label class). */
  static readonly css = {
    label:    'toc-node-label',
    checkbox: 'toc-checkbox',
  } as const;

  #toc: TocComponent | null = null;
  #model: TocModel | null = null;
  #layersState: LayersState | null = null;
  #tocState: TocState | null = null;
  #labelOf: (id: string) => string = id => id;
  #subscriptions: Subscription[] = [];

  /**
   * Binds the toc to its model, stores, and label lookup. May be called before or
   * after the element is connected.
   * @param model - The tree to render (a group with one leaf per layer).
   * @param layersState - Source of truth for leaf visibility (checkbox state).
   * @param tocState - Hub the tree's expansion is kept in sync with, both ways.
   * @param labelOf - Maps a node id to its display label.
   */
  setup(
    model: TocModel,
    layersState: LayersState,
    tocState: TocState,
    labelOf: (id: string) => string,
  ): void {
    this.#model = model;
    this.#layersState = layersState;
    this.#tocState = tocState;
    this.#labelOf = labelOf;
    if (this.isConnected) {
      this.#teardown();
      this.#build();
    }
  }

  /** Called by the browser when the element is inserted into the DOM. */
  connectedCallback(): void {
    this.#build();
  }

  /** Called by the browser when the element is removed from the DOM. */
  disconnectedCallback(): void {
    this.#teardown();
  }

  /** Mounts the inner toc and wires it to the stores. No-op until setup has run. */
  #build(): void {
    if (!this.#model || !this.#layersState || !this.#tocState || this.#toc) return;

    const toc = new TocComponent();
    toc.setup(this.#model, node => this.#renderNode(node));
    this.replaceChildren(toc);
    this.#toc = toc;

    // TocState is the hub: it drives the tree…
    this.#subscriptions.push(
      this.#tocState.on('change', ({ id, expanded }) => {
        if (expanded) toc.expand(id);
        else toc.collapse(id);
      }),
      // …and LayersState visibility mirrors onto the leaf checkboxes.
      this.#layersState.on('change:visible', ({ id, visible }) => this.#setChecked(id, visible)),
    );

    // …and the toc reports its whole expanded state back. `replace` only emits for
    // ids that actually flip, so re-driving the tree from it is a guarded no-op.
    toc.addEventListener(TocComponent.events.change, this.#onTocChange);
  }

  /** Removes all store subscriptions, the toc listener, and the inner toc. */
  #teardown(): void {
    for (const sub of this.#subscriptions) sub.remove();
    this.#subscriptions = [];
    this.#toc?.removeEventListener(TocComponent.events.change, this.#onTocChange);
    this.#toc = null;
    this.replaceChildren();
  }

  /** Reports the toc's whole expanded set back to TocState. */
  #onTocChange = (ev: Event): void => {
    const { expanded } = (ev as CustomEvent<ITocChangeDetail>).detail;
    this.#tocState?.replace(expanded);
  };

  /**
   * Renders one node: leaf layers get a visibility checkbox (wired to LayersState),
   * group nodes just get their label — the toc's own toggle expands them.
   */
  #renderNode(node: ITocNode): HTMLElement {
    const { css } = LayerToc;
    const label = document.createElement('span');
    label.className = css.label;

    if (node.children.length === 0) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = css.checkbox;
      checkbox.dataset.nodeId = node.id;
      checkbox.checked = this.#layersState?.isVisible(node.id) ?? false;
      checkbox.addEventListener('change', () => this.#layersState?.setVisible(node.id, checkbox.checked));
      label.appendChild(checkbox);
    }

    label.append(this.#labelOf(node.id));
    return label;
  }

  /** Syncs the leaf checkbox for `id` to `checked` (no-op if it isn't rendered yet). */
  #setChecked(id: string, checked: boolean): void {
    const checkbox = this.#toc?.querySelector<HTMLInputElement>(
      `.${LayerToc.css.checkbox}[data-node-id="${CSS.escape(id)}"]`,
    );
    if (checkbox) checkbox.checked = checked;
  }
}

if (!customElements.get(LayerToc.tagName)) {
  customElements.define(LayerToc.tagName, LayerToc);
}

export { LayerToc };
