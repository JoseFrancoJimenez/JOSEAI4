/**
 * Serialises the shareable slice of the app state — which toc items are checked
 * and which nodes are expanded — into a compact, URL-safe token, and reads it
 * back. Both fields are plain id arrays so a snapshot round-trips cleanly
 * through JSON and a query string.
 *
 * The token is base64url (base64 with `+/` swapped for `-_` and padding
 * stripped) so it survives being dropped into a URL without further escaping.
 */

/** The shareable slice of the map view: where it's centred and how far zoomed. */
interface ViewSnapshot {
  /** Map center in the view projection (EPSG:3857). */
  center: [number, number];
  /** Zoom level. */
  zoom: number;
}

/** The shareable slice of the feature table: which layer it shows and where in its pages. */
interface TableSnapshot {
  /** Selected layer id, or absent when no layer is selected. */
  layer?: string;
  /** 0-based page. */
  page: number;
  /** Rows per page. */
  pageSize: number;
}

/** A serialisable snapshot of the shareable app state. */
interface AppSnapshot {
  /** Ids of the toc items that are checked. */
  checked: string[];
  /** Ids of the toc nodes that are expanded. */
  expanded: string[];
  /** Map view (center + zoom). Absent in older links, which then keep the default framing. */
  view?: ViewSnapshot;
  /** Feature table state. Absent in older links, which then keep the default (empty) table. */
  table?: TableSnapshot;
}

/** Query-string parameter that carries the encoded snapshot in a share link. */
const SHARE_PARAM = 's';

/** Encodes a snapshot as a URL-safe base64 string (base64url, no padding). */
function encodeSnapshot(snapshot: AppSnapshot): string {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a token produced by {@link encodeSnapshot} back into a snapshot.
 * Returns `null` for anything malformed or wrongly shaped, so a corrupt or
 * hand-edited link degrades to "no restore" rather than throwing.
 */
function decodeSnapshot(token: string): AppSnapshot | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return normaliseSnapshot(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** Narrows unknown parsed JSON to an {@link AppSnapshot}, or `null` if it doesn't fit. */
function normaliseSnapshot(value: unknown): AppSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const checked = toStringArray(record.checked);
  const expanded = toStringArray(record.expanded);
  if (!checked || !expanded) return null;

  const snapshot: AppSnapshot = { checked, expanded };
  const view = toViewSnapshot(record.view);
  if (view) snapshot.view = view;
  const table = toTableSnapshot(record.table);
  if (table) snapshot.table = table;
  return snapshot;
}

/** Returns `value` as a {@link ViewSnapshot} when it is one, else `undefined` (a bad view just drops the framing). */
function toViewSnapshot(value: unknown): ViewSnapshot | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const center = record.center;
  if (
    !Array.isArray(center) || center.length !== 2 ||
    typeof center[0] !== 'number' || typeof center[1] !== 'number' ||
    typeof record.zoom !== 'number'
  ) {
    return undefined;
  }
  return { center: [center[0], center[1]], zoom: record.zoom };
}

/** Returns `value` as a {@link TableSnapshot} when it is one, else `undefined` (a bad table just resets it). */
function toTableSnapshot(value: unknown): TableSnapshot | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const { page, pageSize, layer } = record;
  if (!Number.isInteger(page) || (page as number) < 0) return undefined;
  if (!Number.isInteger(pageSize) || (pageSize as number) < 1) return undefined;
  if (layer !== undefined && typeof layer !== 'string') return undefined;
  const table: TableSnapshot = { page: page as number, pageSize: pageSize as number };
  if (typeof layer === 'string') table.layer = layer;
  return table;
}

/** Returns `value` as a `string[]` when it is one, else `null`. */
function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return null;
  return value as string[];
}

/** Builds an absolute share URL for `snapshot`, based on the current page location. */
function buildShareUrl(snapshot: AppSnapshot): string {
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, encodeSnapshot(snapshot));
  return url.toString();
}

/**
 * Reads and decodes a snapshot from the current URL's query string, or `null`
 * when the share parameter is absent or malformed.
 */
function readSnapshotFromUrl(): AppSnapshot | null {
  const token = new URLSearchParams(window.location.search).get(SHARE_PARAM);
  return token ? decodeSnapshot(token) : null;
}

export { SHARE_PARAM, encodeSnapshot, decodeSnapshot, buildShareUrl, readSnapshotFromUrl };
export type { AppSnapshot, ViewSnapshot, TableSnapshot };
