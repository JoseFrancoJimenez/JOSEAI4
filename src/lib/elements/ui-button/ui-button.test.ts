import { afterEach, describe, expect, it } from 'vitest';
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
