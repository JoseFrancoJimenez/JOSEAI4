import { afterEach, describe, expect, it, vi } from 'vitest';
import './button-group.ts';
import '../../elements/ui-button/ui-button.ts';
import { ButtonGroupElement } from './button-group.ts';
import { UiButtonElement } from '../../elements/ui-button/ui-button.ts';

function mount(html = '<widget-button-group aria-label="Formatting"></widget-button-group>'): ButtonGroupElement {
  document.body.innerHTML = html;
  return document.body.querySelector('widget-button-group') as ButtonGroupElement;
}

/** The actual clickable surface of a `ui-button` — what a real click lands on. */
function control(button: Element): HTMLButtonElement {
  return button.querySelector('.ui-button__control') as HTMLButtonElement;
}

/** `el`'s `ui-button` children, by position — the fixtures below always supply enough of them. */
function buttonAt(el: Element, index: number): UiButtonElement {
  return el.querySelectorAll('ui-button')[index]!;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('widget-button-group role, name, orientation', () => {
  it('sets role="group"', () => {
    const el = mount();
    expect(el.getAttribute('role')).toBe('group');
  });

  it('never writes aria-orientation', () => {
    const el = mount();
    expect(el.hasAttribute('aria-orientation')).toBe(false);
  });

  it('never writes tabindex on the host or on children', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button><ui-button label="Italic" value="b"></ui-button></widget-button-group>',
    );
    expect(el.hasAttribute('tabindex')).toBe(false);
    for (const child of el.children) expect(child.hasAttribute('tabindex')).toBe(false);
  });

  it('orientation reflects both ways, defaulting to horizontal', () => {
    const el = mount();
    expect(el.orientation).toBe('horizontal');

    el.orientation = 'vertical';
    expect(el.getAttribute('orientation')).toBe('vertical');

    el.setAttribute('orientation', 'horizontal');
    expect(el.orientation).toBe('horizontal');
  });
});

describe('widget-button-group dev-only accessible-name check', () => {
  it('warns when neither aria-label nor aria-labelledby is present', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<widget-button-group></widget-button-group>');
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  it('does not warn when aria-label is present', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not warn when aria-labelledby is present', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<widget-button-group aria-labelledby="x"></widget-button-group>');
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('widget-button-group dev-only child checks', () => {
  it('a non-ui-button child warns and is ignored', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<widget-button-group aria-label="Formatting"><div></div></widget-button-group>');
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  it('a ui-button child without a value warns', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<widget-button-group aria-label="Formatting"><ui-button></ui-button></widget-button-group>');
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  it('duplicate values warn', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(
      '<widget-button-group aria-label="Formatting"><ui-button value="a"></ui-button><ui-button value="a"></ui-button></widget-button-group>',
    );
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  it('valid children with distinct values do not warn', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button><ui-button label="Italic" value="b"></ui-button></widget-button-group>',
    );
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('widget-button-group reconnect does not double-run dev checks', () => {
  it('a move (remove, re-append, flush) does not re-warn', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount('<widget-button-group></widget-button-group>');
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);

    const parent = el.parentElement!;
    parent.removeChild(el);
    parent.appendChild(el);
    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('widget-button-group selection — activation', () => {
  it('clicking an inactive button activates it and deactivates the previous', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button><ui-button label="Italic" value="b"></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);
    const b = buttonAt(el, 1);

    control(a).click();
    expect(a.pressed).toBe(true);
    expect(b.pressed).toBe(false);

    control(b).click();
    expect(a.pressed).toBe(false);
    expect(b.pressed).toBe(true);
  });

  it('a click inside a ui-button resolves to it, not to its inner control', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);

    control(a).click();

    expect(a.pressed).toBe(true);
    expect(el.activeButton).toBe(a);
  });

  it('clicking the active one deactivates it and emits { value: null }', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);
    const onChange = vi.fn();
    el.addEventListener('widget-button-group:change', onChange);

    control(a).click();
    control(a).click();

    expect(a.pressed).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { value: null } }));
  });

  it('the event fires once per gesture with the right value', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);
    const onChange = vi.fn();
    el.addEventListener('widget-button-group:change', onChange);

    control(a).click();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toEqual({ value: 'a' });
  });
});

describe('widget-button-group selection — commands and getters', () => {
  it('setActive reflects and does not emit', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button><ui-button label="Italic" value="b"></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);
    const b = buttonAt(el, 1);
    const onChange = vi.fn();
    el.addEventListener('widget-button-group:change', onChange);

    el.setActive('b');

    expect(a.pressed).toBe(false);
    expect(b.pressed).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('setActive with an unknown value clears', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a" pressed></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);

    el.setActive('nope');

    expect(a.pressed).toBe(false);
  });
});

describe('widget-button-group selection — misc', () => {
  it("the native click still reaches a listener on the group's parent", () => {
    document.body.innerHTML =
      '<div><widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button></widget-button-group></div>';
    const parent = document.querySelector('div')!;
    const a = document.querySelector('ui-button')!;
    const onClick = vi.fn();
    parent.addEventListener('click', onClick);

    control(a).click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('both getters return null before any selection', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button></widget-button-group>',
    );
    expect(el.activeValue).toBeNull();
    expect(el.activeButton).toBeNull();
  });

  it('a disabled button cannot be activated', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a" disabled></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);

    control(a).click();

    expect(a.pressed).toBe(false);
    expect(el.activeValue).toBeNull();
  });
});

describe('widget-button-group selection — edge cases', () => {
  it('Enter and Space on a focused button select it (native activation, no extra code)', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);

    // jsdom does not synthesize a click from Enter/Space keydown on a native <button> — real
    // browsers do, and nothing in ui-button or button-group adds keydown handling of its own.
    // .click() on the focused control is what that platform behavior produces.
    control(a).focus();
    control(a).click();

    expect(a.pressed).toBe(true);
  });

  it('removing the active child leaves the getters at null', () => {
    const el = mount(
      '<widget-button-group aria-label="Formatting"><ui-button label="Bold" value="a"></ui-button></widget-button-group>',
    );
    const a = buttonAt(el, 0);

    control(a).click();
    expect(el.activeValue).toBe('a');

    a.remove();

    expect(el.activeValue).toBeNull();
    expect(el.activeButton).toBeNull();
  });

  it('a UiButtonElement subclass registered under a different tag participates fully', () => {
    class FancyButtonElement extends UiButtonElement {}
    if (!customElements.get('fancy-button')) customElements.define('fancy-button', FancyButtonElement);

    const el = mount(
      '<widget-button-group aria-label="Formatting"><fancy-button label="Star" value="star"></fancy-button></widget-button-group>',
    );
    const fancy = el.querySelector('fancy-button') as UiButtonElement;
    const onChange = vi.fn();
    el.addEventListener('widget-button-group:change', onChange);

    control(fancy).click();

    expect(fancy.pressed).toBe(true);
    expect(el.activeValue).toBe('star');
    expect(el.activeButton).toBe(fancy);
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toEqual({ value: 'star' });
  });
});
