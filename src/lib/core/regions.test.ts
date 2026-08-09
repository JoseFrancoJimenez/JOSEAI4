import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillRegion, harvestRegions } from './regions.ts';

function host(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('harvestRegions', () => {
  it('routes a data-region child to its named region', () => {
    const el = host('<span data-region="icon">★</span>');
    const regions = harvestRegions(el);
    expect(regions.get('icon')?.textContent).toBe('★');
  });

  it('routes unnamed children and bare text to default', () => {
    const el = host('Save <span>extra</span>');
    const regions = harvestRegions(el);
    const fragment = regions.get('default')!;
    expect(fragment.textContent).toBe('Save extra');
  });

  it('ignores whitespace-only text nodes', () => {
    const el = host('<span data-region="icon">★</span>\n  ');
    const regions = harvestRegions(el);
    expect(regions.has('default')).toBe(false);
  });

  it('empties the host', () => {
    const el = host('<span data-region="icon">★</span>Save');
    harvestRegions(el);
    expect(el.childNodes.length).toBe(0);
  });

  it('moves all of a fragment-worthy set of children for a region', () => {
    const el = host('<span data-region="icon"><i>a</i><i>b</i></span>');
    const regions = harvestRegions(el);
    expect(regions.get('icon')?.querySelectorAll('i').length).toBe(2);
  });

  it('merges two children with the same data-region, in document order', () => {
    const el = host('<span data-region="footer">a</span><span data-region="footer">b</span>');
    const regions = harvestRegions(el);
    expect(regions.get('footer')?.textContent).toBe('ab');
  });
});

describe('harvestRegions dev warnings', () => {
  it('warns only when document.readyState is "loading"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readyState = vi.spyOn(document, 'readyState', 'get');

    readyState.mockReturnValue('complete');
    harvestRegions(host(''));
    expect(warn).not.toHaveBeenCalled();

    readyState.mockReturnValue('loading');
    harvestRegions(host(''));
    expect(warn).toHaveBeenCalledTimes(1);

    readyState.mockRestore();
    warn.mockRestore();
  });

  it('a harvested name outside accepted warns once, naming the region', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    harvestRegions(host('<span data-region="lable">x</span>'), ['header', 'default', 'footer']);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain('lable');
    error.mockRestore();
  });

  it('no accepted argument means no unclaimed warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    harvestRegions(host('<span data-region="lable">x</span>'));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a name inside accepted does not warn', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    harvestRegions(host('<span data-region="header">x</span>'), ['header', 'default', 'footer']);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('fillRegion', () => {
  it('inserts a string as text, never parsed as HTML', () => {
    const outlet = document.createElement('span');
    fillRegion(outlet, '<b>x</b>');
    expect(outlet.querySelector('b')).toBeNull();
    expect(outlet.textContent).toBe('<b>x</b>');
  });

  it('moves a node as-is', () => {
    const outlet = document.createElement('span');
    const icon = document.createElement('i');
    fillRegion(outlet, icon);
    expect(outlet.firstElementChild).toBe(icon);
  });

  it('moves a fragment as-is, all children', () => {
    const outlet = document.createElement('span');
    const fragment = document.createDocumentFragment();
    fragment.append(document.createElement('i'), document.createElement('b'));
    fillRegion(outlet, fragment);
    expect(outlet.children.length).toBe(2);
  });

  it('replaces previous outlet content', () => {
    const outlet = document.createElement('span');
    outlet.textContent = 'old';
    fillRegion(outlet, 'new');
    expect(outlet.textContent).toBe('new');
  });

  it('clears a previously filled outlet', () => {
    const outlet = document.createElement('span');
    outlet.textContent = 'old';
    fillRegion(outlet, '');
    expect(outlet.textContent).toBe('');
    expect(outlet.childNodes.length).toBe(0);
  });
});
