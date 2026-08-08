# Maps — engine adapters, layer configs, the map widget

Read this when a task touches `src/lib/maps/` — an adapter, a layer config, or the map widget. Components in here follow the `web-components` skill like any other component; this file adds only what is map-specific.

> **Status:** the OpenLayers adapter exists in the previous repo and is being ported with one refactor: the `appLayers` classes are removed in favour of plain config data (§3). The map widget follows it. Port tasks and their breakdown go in a `docs/maps-plan.md` task file, not here.

## 1. What lives here

`src/lib/maps/<engine>/` — engine folders are lower-case (`openlayers/`). Three kinds of thing:

- **Adapter** — a plain class wrapping the engine's map instance. Not an element; a relative of the core tools. Its testable parts are pure functions (§5).
- **Layer config** — the plain-data description of a layer and its exported types (§3).
- **The map widget** — a widget that receives an adapter through `setup({ adapter })` and renders the engine's map into its light DOM. Dependencies arrive through `setup()`, per the skill §5.

Engine imports appear **only** inside `src/lib/maps/<engine>/`. Nothing in `core/`, `elements/`, or `widgets/` may import an engine.

## 2. Dependency policy

- `ol` is a **peerDependency** of the lib package, marked optional in `peerDependenciesMeta`, and a devDependency for typecheck and tests. Each GIS app installs `ol` itself; a non-GIS app installs nothing and gets no warning.
- Apps import maps through the maps subpath only (e.g. `@<scope>/lib/maps/openlayers`). A non-GIS app never imports it, so it never bundles the engine.
- **The map widget imports the engine's CSS** (`import 'ol/ol.css'`) — the component-imports-its-own-CSS rule: importing the widget yields a working map, no separate instruction. Engine stylesheets being global and load-bearing is one of the reasons this repo has no Shadow DOM (`docs/rationale.md`).

## 3. Layer config — the decisions the type cannot express

The TS types exported from the maps subpath **are the spec**. This section records only what a type cannot say.

- **Plain serializable data, no classes.** This is the `appLayers` refactor: config objects can flow through app state, freeze in dev, and diff by reference (`docs/store.md` §3). Behaviour lives in adapter functions, never on the config.
- **One renderer-rule shape:** `{ filter?, else?, label?, style }`, evaluated in order; `else: true` catches the rest. A bare style object (no filter) is accepted as shorthand and normalized to a single rule on load.
- **Expressions are the engine's flat-style syntax** (`match`, `get`, `interpolate`, `case`). The coupling is deliberate: the config is engine-specific by design. Do not invent a neutral expression DSL.
- **`variables[].id` references an entry in `fields`.** TS cannot check a cross-reference inside loaded JSON, so the load path validates it dev-only: `console.error` naming the layer id and the offending variable id.
- **`variable`** (renamed from `default_variable`) names the initially active variable. It is a **seed**: the live active variable is app state and belongs in a store — id plus light metadata, per `docs/store.md` §3.
- **Legends are authored, not derived.** A legend deliberately duplicates the renderer's colours and thresholds; drift is accepted and caught by eye. Do not build a legend deriver.
- camelCase keys throughout.

## 4. Extension by apps

- **Data:** structural typing does the work. An app needing extra metadata declares `type AppLayerConfig = LayerConfig & { category: string }`; lib functions accept `LayerConfig`, so app objects pass through untouched. No registries, no plugin surface.
- **Behaviour:** subclass the adapter to specialize — the standing rule is compose to connect state, inherit to specialize behaviour (`docs/store.md` §4). App subclasses live under `src/apps/`, never in the lib.

## 5. Testing

Keep the engine-touching shell thin. The `config → engine options` mapping (style rules, layer-creation options) is pure functions, tested DOM-free and engine-free — that is the pyramid base (`docs/testing.md` §1). The adapter methods that actually call the engine stay as the thin edge.