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

describe('ui-button skeleton', () => {
  it('mounts and renders a single control', () => {
    const el = mount();
    const controls = el.querySelectorAll('.ui-button__control');
    expect(controls.length).toBe(1);
    expect(controls[0]?.tagName).toBe('BUTTON');
  });

  it('renders empty icon and label spans by default', () => {
    const el = mount();
    expect(iconEl(el).childNodes.length).toBe(0);
    expect(labelEl(el).childNodes.length).toBe(0);
  });

  it('does not re-render on a move (disconnect + reconnect)', async () => {
    const el = mount();
    const controlBefore = control(el);

    el.remove();
    document.body.append(el);
    await Promise.resolve();

    expect(control(el)).toBe(controlBefore);
    expect(el.querySelectorAll('.ui-button__control').length).toBe(1);
  });
});

describe('attributes and properties', () => {
  it('label attribute sets the label span text', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    expect(labelEl(el).textContent).toBe('Save');
  });

  it('icon attribute builds an <i> with the given classes into the icon span', () => {
    const el = mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    const icon = iconEl(el).firstElementChild;
    expect(icon?.tagName).toBe('I');
    expect(icon?.className).toBe('fa-solid fa-star');
  });

  it('icon-position attribute is reflected by the property, default "start"', () => {
    expect(mount().iconPosition).toBe('start');
    expect(mount('<ui-button icon-position="end"></ui-button>').iconPosition).toBe('end');
  });

  it('type attribute overrides the control\'s hardcoded default type', () => {
    expect(control(mount()).type).toBe('button');
    expect(control(mount('<ui-button type="submit"></ui-button>')).type).toBe('submit');
  });

  it('disabled attribute (presence) disables the control', () => {
    expect(control(mount()).disabled).toBe(false);
    expect(control(mount('<ui-button disabled></ui-button>')).disabled).toBe(true);
  });
});

describe('property reflection and write precedence', () => {
  it('each property reflects to its attribute and back', () => {
    const el = mount();

    el.label = 'Save';
    expect(el.getAttribute('label')).toBe('Save');
    expect(el.label).toBe('Save');

    el.icon = 'fa-solid fa-star';
    expect(el.getAttribute('icon')).toBe('fa-solid fa-star');
    expect(el.icon).toBe('fa-solid fa-star');

    el.iconPosition = 'end';
    expect(el.getAttribute('icon-position')).toBe('end');
    expect(el.iconPosition).toBe('end');

    el.type = 'submit';
    expect(el.getAttribute('type')).toBe('submit');
    expect(el.type).toBe('submit');

    el.disabled = true;
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.disabled).toBe(true);
    el.disabled = false;
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.disabled).toBe(false);
  });

  it('a later write replaces an earlier one, whatever the channel', () => {
    const el = mount('<ui-button label="First"></ui-button>');
    expect(labelEl(el).textContent).toBe('First');

    el.label = 'Second';
    expect(labelEl(el).textContent).toBe('Second');

    el.setAttribute('label', 'Third');
    expect(labelEl(el).textContent).toBe('Third');
  });

  it('label="" and icon="" are treated as unset', () => {
    const el = mount('<ui-button label="" icon=""></ui-button>');
    expect(labelEl(el).childNodes.length).toBe(0);
    expect(iconEl(el).childNodes.length).toBe(0);
  });

  it('removing label or icon after render empties the span', () => {
    const el = mount('<ui-button label="Save" icon="fa-solid fa-star"></ui-button>');
    expect(labelEl(el).textContent).toBe('Save');
    expect(iconEl(el).firstElementChild?.tagName).toBe('I');

    el.removeAttribute('label');
    el.removeAttribute('icon');

    expect(labelEl(el).childNodes.length).toBe(0);
    expect(iconEl(el).childNodes.length).toBe(0);
  });
});

describe('pressed', () => {
  it('reflects the property to the attribute and back', () => {
    const el = mount();

    el.pressed = true;
    expect(el.hasAttribute('pressed')).toBe(true);
    expect(el.pressed).toBe(true);

    el.pressed = false;
    expect(el.hasAttribute('pressed')).toBe(false);
    expect(el.pressed).toBe(false);
  });

  it('present at render → control has aria-pressed="true"', () => {
    const el = mount('<ui-button pressed label="Save"></ui-button>');
    expect(control(el).getAttribute('aria-pressed')).toBe('true');
  });

  it('absent at render → control has no aria-pressed attribute at all', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    expect(control(el).hasAttribute('aria-pressed')).toBe(false);
  });

  it('setting pressed after render updates the control', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    el.pressed = true;
    expect(control(el).getAttribute('aria-pressed')).toBe('true');
    el.pressed = false;
    expect(control(el).hasAttribute('aria-pressed')).toBe(false);
  });

  it('setting pressed does not emit anything', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    const spy = vi.fn();
    el.addEventListener('click', spy);
    el.pressed = true;
    expect(spy).not.toHaveBeenCalled();
  });

  it('activating the button does not change pressed — it only fires click', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    control(el).click();
    expect(el.pressed).toBe(false);
  });

  it('aria-pressed written directly on the host is ignored — pressed is the channel', () => {
    const el = mount('<ui-button label="Save" aria-pressed="true"></ui-button>');
    expect(control(el).hasAttribute('aria-pressed')).toBe(false);
  });

  it('disabled and pressed together: control is disabled and aria-pressed="true"', () => {
    const el = mount('<ui-button disabled pressed label="Save"></ui-button>');
    expect(control(el).disabled).toBe(true);
    expect(control(el).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('accessible name forwarding', () => {
  it('forwards a host aria-label to the inner control', () => {
    const el = mount('<ui-button icon="fa-solid fa-star" aria-label="Favourite"></ui-button>');
    expect(control(el).getAttribute('aria-label')).toBe('Favourite');
  });

  it('forwards a host aria-labelledby to the inner control', () => {
    document.body.innerHTML = '<span id="ext-label">Favourite</span><ui-button aria-labelledby="ext-label"></ui-button>';
    const el = document.body.querySelector('ui-button') as UiButtonElement;
    expect(control(el).getAttribute('aria-labelledby')).toBe('ext-label');
  });

  it('an aria-label set after connect reaches the control', () => {
    const el = mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    el.setAttribute('aria-label', 'Favourite');
    expect(control(el).getAttribute('aria-label')).toBe('Favourite');
  });
});

describe('ARIA forwarding list', () => {
  const forwarded = ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-expanded'];

  it.each(forwarded)('%s reaches the control at render', (name) => {
    const el = mount(`<ui-button ${name}="x"></ui-button>`);
    expect(control(el).getAttribute(name)).toBe('x');
  });

  it.each(forwarded)('%s set after render reaches the control', (name) => {
    const el = mount();
    el.setAttribute(name, 'x');
    expect(control(el).getAttribute(name)).toBe('x');
  });

  it.each(forwarded)('removing %s from the host removes it from the control', (name) => {
    const el = mount(`<ui-button ${name}="x"></ui-button>`);
    el.removeAttribute(name);
    expect(control(el).hasAttribute(name)).toBe(false);
  });

  it('the attribute stays on the host as well as the control', () => {
    const el = mount('<ui-button aria-label="Favourite"></ui-button>');
    expect(el.getAttribute('aria-label')).toBe('Favourite');
    expect(control(el).getAttribute('aria-label')).toBe('Favourite');
  });
});

describe('disabled and focus', () => {
  it('disabled blocks activation — a host click handler does not fire', () => {
    const el = mount('<ui-button disabled label="Save"></ui-button>');
    let count = 0;
    el.addEventListener('click', () => { count++; });
    control(el).click();
    expect(count).toBe(0);
  });

  it('disabled removes the control from the tab order', () => {
    const el = mount('<ui-button disabled></ui-button>');
    control(el).focus();
    expect(document.activeElement).not.toBe(control(el));
  });

  it('focus() delegates to the inner control', () => {
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
});

describe('click and form participation', () => {
  it('a click on the inner control bubbles to the host exactly once', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    let count = 0;
    el.addEventListener('click', () => { count++; });
    control(el).click();
    expect(count).toBe(1);
  });

  it('type="submit" inside a form fires the form\'s submit event', () => {
    document.body.innerHTML = '<form><ui-button type="submit" label="Save"></ui-button></form>';
    const form = document.body.querySelector('form')!;
    const el = form.querySelector('ui-button') as UiButtonElement;
    let submitCount = 0;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitCount++;
    });

    control(el).click();

    expect(submitCount).toBe(1);
  });
});

describe('icon-only accessible-name check (dev)', () => {
  it('warns when an icon-only button has no accessible name', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    await Promise.resolve();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('does not warn when an icon-only button has an aria-label', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button icon="fa-solid fa-star" aria-label="Favourite"></ui-button>');
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not warn when a label is present', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button icon="fa-solid fa-star" label="Save"></ui-button>');
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not warn when label is set immediately after connect', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    el.label = 'Save';
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('children-supplied check (dev)', () => {
  it('warns when a text child is supplied', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button>Save</ui-button>');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('warns when an element child is supplied', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button><span>Save</span></ui-button>');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('does not warn for whitespace-only children', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('<ui-button>\n  \n</ui-button>');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not warn when no children are supplied', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
