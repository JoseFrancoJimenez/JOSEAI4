/** Region name a child was routed to: `data-region="<name>"` on a direct child, or `'default'` for everything else. */
type RegionContent = string | Node | DocumentFragment;
type HarvestedRegions = Map<string, DocumentFragment>;

const DEV: boolean = import.meta.env.DEV;

/**
 * Empties `host` and buckets its children into per-region `DocumentFragment`s, keyed by each
 * child's `data-region` (elements without one, and bare text, go to `'default'`). Iterates
 * `childNodes` so bare text survives; whitespace-only text nodes are skipped so pretty-printed
 * markup does not suppress a component's default. Call once, in `connectedCallback`, before
 * anything else — a second call would harvest the component's own rendered skeleton.
 */
function harvestRegions(host: HTMLElement): HarvestedRegions {
  if (DEV && document.readyState === 'loading') {
    console.warn(
      `${host.tagName.toLowerCase()}: harvested while document.readyState is "loading" — ` +
        'a classic blocking script may have registered this element mid-parse, before its ' +
        'children were fully present. Likely a false positive for an inline script during initial parse.',
    );
  }

  const regions: HarvestedRegions = new Map();
  const nodes = Array.from(host.childNodes);

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent!.trim() === '') continue;

    const name = node instanceof Element ? (node.getAttribute('data-region') ?? 'default') : 'default';
    let fragment = regions.get(name);
    if (!fragment) {
      fragment = document.createDocumentFragment();
      regions.set(name, fragment);
    }
    fragment.appendChild(node);
  }

  host.replaceChildren();
  return regions;
}

/** Replaces `outlet`'s children with `content`. A string enters as text, never parsed as HTML; a node or fragment is moved as-is. */
function fillRegion(outlet: Element, content: RegionContent): void {
  if (typeof content === 'string') {
    outlet.textContent = content;
    return;
  }
  outlet.replaceChildren(content);
}

export { harvestRegions, fillRegion };
export type { RegionContent, HarvestedRegions };
