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
 *
 * `accepted` is the calling component's declared region names (its `regionNames`). It is
 * optional and dev-only in effect: a harvested name outside it means the content is claimed by
 * no outlet and about to be destroyed, so it is `console.error`'d as the only evidence.
 */
function harvestRegions(host: HTMLElement, accepted?: readonly string[]): HarvestedRegions {
  warnIfLoading(host);

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
  warnUnclaimed(host, regions, accepted);

  return regions;
}

function warnIfLoading(host: HTMLElement): void {
  if (!DEV || document.readyState !== 'loading') return;
  console.warn(
    `${host.tagName.toLowerCase()}: harvested while document.readyState is "loading" — ` +
      'a classic blocking script may have registered this element mid-parse, before its ' +
      'children were fully present. Likely a false positive for an inline script during initial parse.',
  );
}

/** A harvested region name outside `accepted` means its content is claimed by no outlet and about to be destroyed. */
function warnUnclaimed(host: HTMLElement, regions: HarvestedRegions, accepted?: readonly string[]): void {
  if (!DEV || !accepted) return;
  for (const name of regions.keys()) {
    if (accepted.includes(name)) continue;
    console.error(
      `${host.tagName.toLowerCase()}: unrecognised content region "${name}" — its content is discarded. ` +
        `Accepted regions: ${accepted.join(', ')}.`,
    );
  }
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
