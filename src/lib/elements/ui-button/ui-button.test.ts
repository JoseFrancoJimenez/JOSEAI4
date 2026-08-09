import { afterEach, describe, expect, it, vi } from 'vitest';
import './ui-button.ts';
import type { UiButtonElement } from './ui-button.ts';

function mount(html = '<ui-button></ui-button>'): UiButtonElement {
  document.body.innerHTML = html;
  return document.body.querySelector('ui-button') as UiButtonElement;
}

function control(el: UiButtonElement): HTMLButtonElement {
  return el.querySelector('.ui-button__control') as HTMLButtonElement;
}

function iconEl(el: UiButtonElement): HTMLElement {
  return el.querySelector('.ui-button__icon') as HTMLElement;
}

function labelEl(el: UiButtonElement): HTMLElement {
  return el.querySelector('.ui-button__label') as HTMLElement;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('ui-button attributes and properties', () => {
  it('renders label, icon, type, disabled, pressed, value from attributes', () => {
    const el = mount(
      '<ui-button label="Save" icon="fa-solid fa-star" type="submit" disabled pressed value="save"></ui-button>',
    );

    expect(labelEl(el).textContent).toBe('Save');
    expect(iconEl(el).querySelector('i')?.className).toBe('fa-solid fa-star');
    expect(control(el).type).toBe('submit');
    expect(control(el).disabled).toBe(true);
    expect(control(el).getAttribute('aria-pressed')).toBe('true');
    expect(el.value).toBe('save');
  });

  it('renders icon-position via the attribute (styled by CSS, not observed)', () => {
    const el = mount('<ui-button icon-position="end"></ui-button>');
    expect(el.iconPosition).toBe('end');
    expect(el.getAttribute('icon-position')).toBe('end');
  });

  it.each([
    ['label', 'Save'],
    ['icon', 'fa-solid fa-star'],
    ['type', 'submit'],
    ['value', 'save'],
  ] as const)('property %s reflects to its attribute and back', (prop, value) => {
    const el = mount();
    (el as unknown as Record<string, string>)[prop] = value;
    expect(el.getAttribute(prop)).toBe(value);
    expect((el as unknown as Record<string, string>)[prop]).toBe(value);
  });

  it('disabled and pressed properties reflect as presence attributes', () => {
    const el = mount();

    el.disabled = true;
    expect(el.hasAttribute('disabled')).toBe(true);
    el.disabled = false;
    expect(el.hasAttribute('disabled')).toBe(false);

    el.pressed = true;
    expect(el.hasAttribute('pressed')).toBe(true);
    el.pressed = false;
    expect(el.hasAttribute('pressed')).toBe(false);
  });

  it('setting icon twice does not leave stale classes behind', () => {
    const el = mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    el.icon = 'fa-solid fa-heart';
    const icons = iconEl(el).querySelectorAll('i');
    expect(icons.length).toBe(1);
    expect(icons[0]?.className).toBe('fa-solid fa-heart');
  });
});

describe('ui-button clearing and reflection', () => {
  it('a later write replaces an earlier one, whatever the channel', () => {
    const el = mount('<ui-button label="First"></ui-button>');
    expect(labelEl(el).textContent).toBe('First');

    el.setAttribute('label', 'Second');
    expect(labelEl(el).textContent).toBe('Second');

    el.label = 'Third';
    expect(labelEl(el).textContent).toBe('Third');
    expect(el.getAttribute('label')).toBe('Third');
  });

  it('label="" and icon="" are treated as unset', () => {
    const el = mount('<ui-button label="" icon=""></ui-button>');
    expect(el.label).toBe('');
    expect(el.icon).toBe('');
    expect(labelEl(el).textContent).toBe('');
    expect(iconEl(el).childNodes.length).toBe(0);
  });

  it('removing label or icon after render empties the span', () => {
    const el = mount('<ui-button label="Save" icon="fa-solid fa-star"></ui-button>');
    expect(labelEl(el).textContent).toBe('Save');
    expect(iconEl(el).childNodes.length).toBe(1);

    el.removeAttribute('label');
    el.removeAttribute('icon');

    expect(labelEl(el).textContent).toBe('');
    expect(iconEl(el).childNodes.length).toBe(0);
  });
});

describe('ui-button activation and focus', () => {
  it('disabled blocks activation and removes the control from the tab order', () => {
    const el = mount('<ui-button label="Save" disabled></ui-button>');
    const onClick = vi.fn();
    el.addEventListener('click', onClick);

    control(el).click();

    expect(onClick).not.toHaveBeenCalled();

    control(el).focus();
    expect(document.activeElement).not.toBe(control(el));
  });

  it('focus() lands on the inner control', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    el.focus();
    expect(document.activeElement).toBe(control(el));
  });

  it('blur() delegates to the inner control', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    el.focus();
    el.blur();
    expect(document.activeElement).not.toBe(control(el));
  });

  it('a click handler on the host fires exactly once', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    const onClick = vi.fn();
    el.addEventListener('click', onClick);

    control(el).click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('type="submit" inside a form fires the form submit event', () => {
    document.body.innerHTML = '<form><ui-button type="submit" label="Save"></ui-button></form>';
    const form = document.querySelector('form')!;
    const el = document.querySelector('ui-button') as UiButtonElement;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);

    control(el).click();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('ui-button pressed and value', () => {
  it('pressed present renders aria-pressed="true"; absent renders no aria-pressed at all', () => {
    const pressed = mount('<ui-button pressed></ui-button>');
    expect(control(pressed).getAttribute('aria-pressed')).toBe('true');

    const notPressed = mount('<ui-button></ui-button>');
    expect(control(notPressed).hasAttribute('aria-pressed')).toBe(false);
  });

  it('setting pressed after render updates the control', () => {
    const el = mount('<ui-button></ui-button>');
    expect(control(el).hasAttribute('aria-pressed')).toBe(false);

    el.pressed = true;
    expect(control(el).getAttribute('aria-pressed')).toBe('true');

    el.pressed = false;
    expect(control(el).hasAttribute('aria-pressed')).toBe(false);
  });

  it('setting pressed emits nothing', () => {
    const el = mount('<ui-button></ui-button>');
    const listener = vi.fn();
    el.addEventListener('click', listener);
    el.addEventListener('ui-button:change', listener);

    el.pressed = true;

    expect(listener).not.toHaveBeenCalled();
  });

  it('activating the button does not change pressed', () => {
    const el = mount('<ui-button pressed></ui-button>');
    control(el).click();
    expect(el.pressed).toBe(true);

    const notPressed = mount('<ui-button></ui-button>');
    control(notPressed).click();
    expect(notPressed.pressed).toBe(false);
  });

  it('disabled and pressed together both apply', () => {
    const el = mount('<ui-button disabled pressed></ui-button>');
    expect(control(el).disabled).toBe(true);
    expect(control(el).getAttribute('aria-pressed')).toBe('true');
  });

  it('aria-pressed set on the host is ignored', () => {
    const el = mount('<ui-button></ui-button>');
    el.setAttribute('aria-pressed', 'true');
    expect(control(el).hasAttribute('aria-pressed')).toBe(false);
  });

  it('value reflects both ways and renders nothing', () => {
    const el = mount('<ui-button value="save"></ui-button>');
    expect(el.value).toBe('save');

    el.value = 'cancel';
    expect(el.getAttribute('value')).toBe('cancel');
    expect(labelEl(el).textContent).toBe('');
    expect(control(el).hasAttribute('value')).toBe(false);
  });
});

describe('ui-button forwarded ARIA', () => {
  it('each forwarded attribute reaches the control at render', () => {
    const el = mount(
      '<ui-button aria-label="Favourite" aria-labelledby="x" aria-describedby="y" aria-controls="z" aria-expanded="true"></ui-button>',
    );

    expect(control(el).getAttribute('aria-label')).toBe('Favourite');
    expect(control(el).getAttribute('aria-labelledby')).toBe('x');
    expect(control(el).getAttribute('aria-describedby')).toBe('y');
    expect(control(el).getAttribute('aria-controls')).toBe('z');
    expect(control(el).getAttribute('aria-expanded')).toBe('true');
  });

  it('the attribute stays on the host as well', () => {
    const el = mount('<ui-button aria-label="Favourite"></ui-button>');
    expect(el.getAttribute('aria-label')).toBe('Favourite');
  });

  it('one set after render reaches the control', () => {
    const el = mount('<ui-button></ui-button>');
    el.setAttribute('aria-expanded', 'false');
    expect(control(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('removing it from the host removes it from the control', () => {
    const el = mount('<ui-button aria-label="Favourite"></ui-button>');
    el.removeAttribute('aria-label');
    expect(control(el).hasAttribute('aria-label')).toBe(false);
  });
});

describe('ui-button dev-only accessible-name check', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('icon-only without a name errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  it('icon-only with aria-label does not error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button icon="fa-solid fa-star" aria-label="Favourite"></ui-button>');
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it('a label present does not error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button icon="fa-solid fa-star" label="Favourite"></ui-button>');
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it('setting label immediately after connect does not error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    el.label = 'Favourite';
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('ui-button dev-only children-supplied check', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a text child errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button>Save</ui-button>');
    expect(spy).toHaveBeenCalled();
  });

  it('whitespace-only children do not error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button>\n  \n</ui-button>');
    expect(spy).not.toHaveBeenCalled();
  });
});
