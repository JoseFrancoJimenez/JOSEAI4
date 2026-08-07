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

function iconOutlet(el: UiButtonElement): HTMLElement {
  return el.querySelector('[data-outlet="icon"]') as HTMLElement;
}

function labelOutlet(el: UiButtonElement): HTMLElement {
  return el.querySelector('[data-outlet="default"]') as HTMLElement;
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

  it('renders empty icon and label outlets by default', () => {
    const el = mount();
    expect(iconOutlet(el).childNodes.length).toBe(0);
    expect(labelOutlet(el).childNodes.length).toBe(0);
  });

  it('harvests consumer content out of the host on first connect', () => {
    const el = mount('<ui-button>Save</ui-button>');
    expect(el.textContent?.trim()).toBe('Save');
  });

  it('does not re-render or re-harvest on a move (disconnect + reconnect)', async () => {
    const el = mount('<ui-button>Save</ui-button>');
    const controlBefore = control(el);

    el.remove();
    document.body.append(el);
    await Promise.resolve();

    expect(control(el)).toBe(controlBefore);
    expect(el.querySelectorAll('.ui-button__control').length).toBe(1);
  });
});

describe('attributes and properties', () => {
  it('label attribute fills the default outlet as text', () => {
    const el = mount('<ui-button label="Save"></ui-button>');
    expect(labelOutlet(el).textContent).toBe('Save');
  });

  it('icon attribute builds an <i> with the given classes into the icon outlet', () => {
    const el = mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    const icon = iconOutlet(el).firstElementChild;
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

  it('label="" is treated as unset, not empty — an icon-only button', () => {
    const el = mount('<ui-button label="" icon="fa-solid fa-star"></ui-button>');
    expect(labelOutlet(el).childNodes.length).toBe(0);
    expect(iconOutlet(el).firstElementChild?.tagName).toBe('I');
  });
});

describe('region precedence', () => {
  it('a harvested region beats the convenience attribute for the same outlet at first render', () => {
    const el = mount('<ui-button icon="fa-solid fa-star"><span data-region="icon">CUSTOM</span></ui-button>');
    expect(iconOutlet(el).textContent).toBe('CUSTOM');
    expect(iconOutlet(el).querySelector('i')).toBeNull();
  });

  it('a later property write replaces previously harvested content', () => {
    const el = mount('<ui-button><span data-region="icon">CUSTOM</span></ui-button>');
    expect(iconOutlet(el).textContent).toBe('CUSTOM');

    el.icon = 'fa-solid fa-heart';
    const icon = iconOutlet(el).firstElementChild;
    expect(icon?.tagName).toBe('I');
    expect(icon?.className).toBe('fa-solid fa-heart');
  });

  it('a later attribute write replaces previously harvested content', () => {
    const el = mount('<ui-button><span data-region="default">CUSTOM</span></ui-button>');
    expect(labelOutlet(el).textContent).toBe('CUSTOM');

    el.setAttribute('label', 'Save');
    expect(labelOutlet(el).textContent).toBe('Save');
  });
});

describe('setContent', () => {
  it('applies immediately when called after render', () => {
    const el = mount();
    el.setContent('default', 'Hello');
    expect(labelOutlet(el).textContent).toBe('Hello');
  });

  it('stashes before render and applies at first render, beating both attribute defaults and harvest', () => {
    const el = document.createElement('ui-button');
    el.icon = 'fa-solid fa-star';
    const node = document.createElement('b');
    node.textContent = 'X';
    el.setContent('icon', node);
    document.body.append(el);

    expect(iconOutlet(el).firstElementChild).toBe(node);
  });

  it('never throws and ignores an unknown region name', () => {
    const el = mount();
    expect(() => el.setContent('bogus' as unknown as 'icon', 'x')).not.toThrow();
    expect(iconOutlet(el).childNodes.length).toBe(0);
    expect(labelOutlet(el).childNodes.length).toBe(0);
  });

  it('inserts a string as text, never parsed as HTML', () => {
    const el = mount();
    el.setContent('default', '<b>x</b>');
    expect(labelOutlet(el).querySelector('b')).toBeNull();
    expect(labelOutlet(el).textContent).toBe('<b>x</b>');
  });
});

describe('accessibility and focus', () => {
  it('forwards a host aria-label to the inner control', () => {
    const el = mount('<ui-button icon="fa-solid fa-star" aria-label="Favourite"></ui-button>');
    expect(control(el).getAttribute('aria-label')).toBe('Favourite');
  });

  it('forwards a host aria-labelledby to the inner control', () => {
    document.body.innerHTML = '<span id="ext-label">Favourite</span><ui-button aria-labelledby="ext-label"></ui-button>';
    const el = document.body.querySelector('ui-button') as UiButtonElement;
    expect(control(el).getAttribute('aria-labelledby')).toBe('ext-label');
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

  it('does not warn when setContent fills the default region right after connect', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount('<ui-button icon="fa-solid fa-star"></ui-button>');
    el.setContent('default', 'Save');
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
