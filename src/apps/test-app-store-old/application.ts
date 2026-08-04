import type { TocModel } from '../lib/widgets/toc/toc-model.ts';
import { CheckSummary } from './widgets/checkSummary/check-summary.ts';
import { ControlBar } from './widgets/controlBar/control-bar.ts';
import { ShareButton } from './widgets/shareButton/share-button.ts';
import { PopupWidget } from './widgets/popup/popup.ts';
import { DrawWidget } from './widgets/draw/draw.ts';
import { TableWidget } from './widgets/table/table.ts';
import { LayerToc, buildLayerToc } from './widgets/toc/layer-toc.ts';
import { ToggleButtons } from './widgets/toggleButtons/toggle-buttons.ts';
import { MapWidget } from './widgets/map/map-widget.ts';
import { LayersState, MapState, TocState, TableState } from './state/index.ts';
import { readSnapshotFromUrl, type AppSnapshot } from './share.ts';
import { createDataSource, type DataSourceRegistry } from '../lib/maps/data/dataSourceFactory.ts';
import { VectorAppLayer } from '../lib/maps/layers/vectorLayer.ts';
import type { VectorLayerConfig } from '../lib/maps/layers/types.ts';
import { fromLonLat, transformExtent } from 'ol/proj';
import provincesConfig from './testData/layers/provinces.json';
import pointsConfig from './testData/layers/points.json';
import airportsConfig from './testData/layers/airports.json';

import 'ol/ol.css';
import './application.css';

// Rough bounding box of Canada (lon/lat), projected to the map's Web Mercator.
const CANADA_EXTENT = transformExtent([-141.0, 41.7, -52.6, 83.1], 'EPSG:4326', 'EPSG:3857');

// Initial view: centred on Canada to match the datasets, zoomed out to the country.
const INITIAL_CENTER = fromLonLat([-96.8, 62]) as [number, number];
const INITIAL_ZOOM = 3;

// The widgets are declared here and configured (via setup) in connectedCallback.
// Their custom elements are already defined by the imports above, so they upgrade
// as this markup is parsed.
const APP_TEMPLATE = `
<div class="app">
    <h1>My Application</h1>
    <p>Welcome to my application!</p>

    <map-widget></map-widget>
    <map-popup></map-popup>
    <map-draw></map-draw>
    <control-bar></control-bar>
    <share-button></share-button>
    <toggle-buttons></toggle-buttons>
    <layer-toc></layer-toc>
    <check-summary></check-summary>
    <feature-table></feature-table>
</div>
`;

/** The demo layer configs (Canadian provinces, sample points, airports). */
function loadLayerConfigs(): VectorLayerConfig[] {
    return [provincesConfig, pointsConfig, airportsConfig].map(config => config as unknown as VectorLayerConfig);
}

/** Per-layer data sources (id → LayerDataSource) from the lib/maps/data factory. */
function buildDataSources(configs: VectorLayerConfig[]): DataSourceRegistry {
    return new Map(configs.map(config => [config.id, createDataSource(config)]));
}

/** The stores + model the initial-state pass writes through. */
interface AppState {
    layers: VectorAppLayer[];
    layersState: LayersState;
    tocState: TocState;
    mapState: MapState;
    tableState: TableState;
    model: TocModel;
}

/**
 * Applies the starting state last, so every store write fans out through the wired
 * handlers — updating the toc, buttons, summary, table, and map together. From a
 * share link when present, otherwise from each layer's own visibility with the
 * group opened. Checks are applied before expansion because the toc builds a
 * layer's checkbox lazily when its group expands, reading LayersState at that
 * moment; expand() is pure, so a collapsed group stays collapsed.
 */
function applyInitialState(snapshot: AppSnapshot | null, state: AppState): void {
    const { layers, layersState, tocState, mapState, tableState, model } = state;

    if (!snapshot) {
        for (const layer of layers) layersState.setVisible(layer.id, layer.visible);
        // Open the top-level groups so their layers are shown from the start.
        for (const root of model.roots) {
            if (root.children.length) tocState.set(root.id, true);
        }
        return;
    }

    const checkedIds = new Set(snapshot.checked);
    for (const layer of layers) layersState.setVisible(layer.id, checkedIds.has(layer.id));
    tocState.replace(snapshot.expanded.filter(id => Boolean(model.get(id)?.children.length)));

    // Restore the shared view; drives the OL view through AppMap's sync.
    if (snapshot.view) {
        mapState.center = snapshot.view.center;
        mapState.zoom = snapshot.view.zoom;
    }
    // Restore the shared table page. Drop the selected layer if it's unknown (e.g.
    // the link outlived a layer) so the table falls back to empty.
    if (snapshot.table) {
        const layerId = snapshot.table.layer && layersState.getLayer(snapshot.table.layer)
            ? snapshot.table.layer
            : undefined;
        tableState.restore({
            selectedLayerId: layerId,
            page: snapshot.table.page,
            pageSize: snapshot.table.pageSize,
        });
    }
}

class Application extends HTMLElement {

    connectedCallback(): void {
        this.innerHTML = APP_TEMPLATE;

        // A share link (when present) restores visibility, expansion, the map view,
        // and the table; read once so the initial framing and the restore agree.
        const snapshot = readSnapshotFromUrl();

        const configs = loadLayerConfigs();
        // AppLayers hold each layer's state (visibility, opacity, active variable →
        // style). LayersState owns them and is the source of truth for visibility.
        const layers = configs.map(config => new VectorAppLayer(config));
        const layersState = new LayersState(layers);
        const dataSources = buildDataSources(configs);
        const mapState = new MapState({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM });
        const tableState = new TableState();
        const { model, labels } = buildLayerToc(layers);
        // Only nodes with children (the group) are expandable.
        const tocState = new TocState(
            [...model].filter(node => node.children.length).map(node => node.id),
        );

        // Hand each widget declared in the template the stores it drives; each
        // self-wires (the state-driven widgets read the layer list straight from
        // LayersState). A shared view suppresses the default Canada framing (it
        // restores its own position in applyInitialState below).
        const mapWidget = this.#widget(MapWidget);
        mapWidget.setup(mapState, layersState, snapshot?.view ? undefined : CANADA_EXTENT);
        this.#widget(PopupWidget).setup(mapWidget.map, layersState, mapState);
        this.#widget(DrawWidget).setup(mapWidget.map, mapState);
        this.#widget(ControlBar).setup(layersState, tocState);
        this.#widget(ShareButton).setup(layersState, tocState, mapState, tableState);
        this.#widget(ToggleButtons).setup(layersState);
        this.#widget(LayerToc).setup(model, layersState, tocState, id => labels.get(id) ?? id);
        this.#widget(CheckSummary).setup(layersState);
        this.#widget(TableWidget).setup(layersState, tableState, dataSources);

        applyInitialState(snapshot, { layers, layersState, tocState, mapState, tableState, model });
    }

    /** Finds the widget declared in the template by its element class, typed as that class. */
    #widget<T extends HTMLElement>(ctor: { tagName: string; prototype: T }): T {
        const el = this.querySelector<T>(ctor.tagName);
        if (!el) throw new Error(`Application: <${ctor.tagName}> is missing from the template`);
        return el;
    }
}

customElements.define('my-application', Application);

export { Application };
