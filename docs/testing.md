# Testing components

Vitest + jsdom. Tests are co-located as `*.test.ts` next to the source. Run and iterate in the **terminal**, not in chat.

**Pragmatic by default: build the minimum that works; add abstraction only when a concrete need forces it — never speculatively.** Fewer, sharper tests over exhaustive ones — but the pyramid base is not the place to economise.

## 1. What to test at each layer

| Layer | How | What to assert |
|---|---|---|
| Pure model / ViewModel | Instantiate, no DOM | Rules, edge cases, empty input. Fast and exhaustive — this is the big win, put the effort here. |
| UI element | Mount, set props, interact | Property in → rendered output. Interaction → the right event on the host, with the right `detail` where it is a `CustomEvent`. |
| Widget | Mount, drive through its public API | Readiness gate, commands, delegated keyboard/pointer, emitted events, ARIA after every operation. |
| App wrapper | Fake model / fake store | The wiring in both directions, nothing else. |

If logic is hard to test because it needs a DOM, that is the signal to extract it into a plain class — not to write a heavier test.

## 2. Mount and clean up

One helper per test file:

```ts
function mount(): DatepickerElement {
  const el = document.createElement('widget-datepicker');
  document.body.append(el);
  return el;
}

afterEach(() => { document.body.replaceChildren(); });
```

Importing the component module registers the tag; no manual `define` in tests.

## 3. Assert semantics, not markup

- Assert **attributes, roles, text content, and dispatched events**.
- Never assert on an `innerHTML` string or a snapshot — it locks in incidental markup and breaks on every cosmetic change.
- Never assert on computed layout (`getBoundingClientRect`, computed `display`, sizes). **jsdom performs no layout.** For a collapsed section, assert `aria-expanded="false"` or the class, not that it is invisible. For an unfilled outlet, assert it is empty — its hiding is CSS.

## 4. Events

```ts
const events: CustomEvent[] = [];
el.addEventListener('widget-datepicker:change', (e) => events.push(e as CustomEvent));
```

Assert count as well as payload. For a component whose output is a native bubbling event, assert it reaches the host and that nothing re-dispatches it (one handler call, not two). Two cases are worth an explicit test in every component that both emits and has commands:

- A user gesture **emits**.
- A state-setting command **does not emit**.

## 5. Interaction

Use real events, dispatched at the element the user would actually hit:

```ts
item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
```

`bubbles: true` matters — the widget delegates at the container. Call `.focus()` for real focus assertions and assert on `document.activeElement`.

## 6. Synchronous by default

If the component does no async work, the tests need no flush, no `await tick()`, no fake timers. If a test needs a flush, that is a finding about the component, not about the test.

`disconnectedCallback` teardown is deliberately deferred by a microtask, so a destroy test needs one microtask:

```ts
el.remove();
await Promise.resolve();
```

A move test asserts the opposite: remove, re-append, flush, and confirm nothing was torn down.

A dev-only check deferred by a microtask (an accessible-name check, say) is tested the same way: act, `await Promise.resolve()`, then assert on a `console.error` spy.

## 7. Cases worth a test in most components

- Readiness: before `setup()`, renders nothing and commands throw with a clear message; after `setup()`, renders.
- `setup()` twice is a no-op.
- Instantiated from HTML (`document.body.innerHTML = '<widget-datepicker …>'`) as well as programmatically.
- Disconnect-then-reconnect (a move) preserves state and does not double-subscribe.
- Getters before setup return safe empties.
- Only the affected region of the DOM changed, where a component makes targeted updates.
- Each reflecting property: property in → attribute out, attribute in → property out, and **clearing** — removing the attribute or setting the property empty leaves the DOM and the getter agreeing.

For a component with content regions:

- `data-region` content lands in the matching outlet: `document.body.innerHTML = '<widget-panel><span data-region="header">Layers</span>Empty</widget-panel>'`, then assert per outlet.
- A bare text child lands in the `default` outlet (harvest reads `childNodes`).
- Whitespace-only text nodes are ignored — pretty-printed markup does not suppress the component's default.
- Two children with the same `data-region` both land, in document order.
- A `data-region` name the component does not declare produces a dev error — the content is destroyed, so the warning is the only evidence.
- `setContent` works before render (stashed) and after render (immediate), never throws, and overrides harvested content.
- `setContent(name, '')` clears a filled outlet.
- A region nobody supplied keeps the skeleton default; with neither, the outlet is empty.
- A string is inserted as text, not parsed — `setContent('label', '<b>x</b>')` yields no `<b>` element.
- A move (remove, re-append, flush a microtask) does not re-harvest: the rendered skeleton is intact.
- An unknown region name passed to `setContent` is ignored without throwing.

For a component with **no** content regions:

- Children supplied in markup produce a dev error. They are deleted at render, so as above the warning is the only evidence the consumer gets.
- Whitespace-only children do not trigger it — pretty-printed markup is not a mistake.

## 8. Commands

```
pnpm test        # or workspace-scoped: pnpm --filter <pkg> test
pnpm typecheck
pnpm lint
```

All three green before reporting a task complete.
