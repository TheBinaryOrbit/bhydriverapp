import AsyncStorage from '@react-native-async-storage/async-storage';

import { API, apiError, apiUrl } from './api';
import type { AppContentPage, AppContentSummary } from '../types/driver';

/**
 * Static pages (Help & Support, About Us, Privacy, Terms) served as HTML so
 * they can change without an app release. No auth header needed.
 *
 * Pages are cached on device: callers render the cached copy immediately and
 * replace it when the network copy lands, so a page opens instantly and still
 * works offline.
 */
const CACHE_PREFIX = '@bhy/appContent/';

/** Menu list — no HTML bodies. Drive the Support section off this, never a hard-coded list. */
export async function fetchContentList(): Promise<AppContentSummary[]> {
  const res = await fetch(apiUrl(API.endpoints.appContent));
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load pages');
  }
  const list: AppContentSummary[] = Array.isArray(data?.data) ? data.data : [];
  await cacheList(list);
  return list;
}

/** Last-known menu list, for offline / first-paint. */
export async function getCachedContentList(): Promise<AppContentSummary[]> {
  return (await readCache<AppContentSummary[]>('list')) ?? [];
}

/** One page by `_id` or `slug`. */
export async function fetchContentPage(
  idOrSlug: string,
): Promise<AppContentPage> {
  const res = await fetch(`${apiUrl(API.endpoints.appContent)}/${idOrSlug}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.content) {
    throw apiError(data, res.status, 'Failed to load page');
  }
  await AsyncStorage.setItem(
    `${CACHE_PREFIX}${idOrSlug}`,
    JSON.stringify(data),
  ).catch(() => {});
  return data;
}

export async function getCachedContentPage(
  idOrSlug: string,
): Promise<AppContentPage | null> {
  return readCache<AppContentPage>(idOrSlug);
}

/**
 * Wraps a content fragment in a styled document. The fragment has no `<html>`
 * wrapper and no CSS of its own, so it inherits nothing without this.
 */
export function wrapContentHtml(fragment: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, Roboto, sans-serif; font-size: 15px;
         line-height: 1.65; color: #1a1a1a; padding: 20px 20px 40px; margin: 0;
         background: #ffffff; -webkit-text-size-adjust: 100%; }
  h1 { font-size: 21px; color: #002d4b; margin: 0 0 12px; }
  h2 { font-size: 17px; color: #002d4b; margin: 26px 0 8px; }
  h3 { font-size: 15px; color: #002d4b; margin: 20px 0 6px; }
  p, li { color: #333333; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  strong { color: #002d4b; }
  a { color: #ff6b05; text-decoration: none; font-weight: 600; }
</style>
</head><body>${fragment}</body></html>`;
}

async function cacheList(list: AppContentSummary[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}list`, JSON.stringify(list));
  } catch {
    // A failed cache write must never break the screen.
  }
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
