1. The store tool (app-level state)
The base Store<TState> is a library tool but is meant for application global state. Summary (full spec: docs/store-brief.md):

Pub/sub by first-level key, built on Evented. Each key K → a change:${K} event carrying { value, previous }.
Immutability by convention + dev-only deep freeze (stripped in prod). No cloning on read or write.
Change detection is Object.is on references — never JSON.stringify.
Plain serializable data only; prefer object records over Map/Set. No class instances, DOM nodes, functions, or map instances in state.
Heavy data stays out: ids + light metadata in state; heavy payloads in a service cache keyed by id.
API: get, getAll, set, update, batch, subscribe, subscribeMany, with an { immediate } option. Domain stores, not one mega-store.
Critical separation: the base Store is for app global state. Library widgets do not use it — they use their own local state. Concrete domain stores (an app's layers, viewport, cart) and any store instances live in an app under src/apps/, not in src/lib.

2. Wiring a widget to a store (app-level, for mini-apps)
When a prototype/app needs a library widget driven by global state, wrap it in an app-level web component.

Composition, not inheritance, to connect state. (Inheritance couples you to the widget's internals.) Rule: compose to connect state; inherit only to specialize behavior.
The wrapper owns the domain model and derives it from the store. It injects a read-only view of the model into the library widget.
Single writer, guaranteed by types. Split the model's surface into a readable interface (roots/get/iterate/subscribe) and a writable one (adds add/remove/move/clear). The widget's setup takes the readable interface, so it cannot mutate domain. Only the wrapper holds the writable model.
Data flow: store → model (the wrapper is the sole writer, reconciling from the store) and view → store (mirror view-state such as expansion back; the store's Object.is guard breaks any echo).
Lifecycle (the wrapper is a custom element):

Do not read the store in a field initializer (#model = new Model(derive(store...))). Field init runs at element construction, which can precede store population → you build an empty tree. Instead: construct the model empty; populate it in connectedCallback via the same sync path used for all updates.
Cover both orders with one mechanism: subscribeMany([...], sync, { immediate: true }). immediate runs the sync once now (data already in the store at mount), and the subscription fires on every later change (store populated after mount).
Clean up subscriptions in disconnectedCallback, matched one-to-one per connect. Create the model once (field), (re)subscribe per connect.
Optionally hydrate view-state from the store on (re)connect so it survives a DOM move/remount.
Dependency points app → library only. The wrapper imports the library widget, never the reverse. The wrapper lives in an app under src/apps/.