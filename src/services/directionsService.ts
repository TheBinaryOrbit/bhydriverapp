import { API } from './api';
import type { LatLng } from '../types/quickRide';

/**
 * The driving route between two points, as the road actually runs.
 *
 * `GET /maps/api/directions` — Google's web service, called straight from the
 * app because nothing on our own API returns a route. That has one consequence
 * worth stating plainly: **a web-service call cannot use an app-restricted
 * key**, so this needs its own key (`API.directionsApiKey`) with the Directions
 * API enabled — not the `MAPS_API_KEY` the native SDKs use. Without one every
 * call here returns `null` and the map falls back to a straight line, which is
 * exactly what it drew before.
 *
 * The right home for this is a backend endpoint that holds the key and proxies
 * the call. Until that exists, this is the version that keeps the key in one
 * named place instead of scattered through the map component.
 */

/** Routes already fetched this app run, keyed by leg. */
const cache = new Map<string, LatLng[]>();

/** How long a route request is worth waiting for on a phone in a car. */
const TIMEOUT_MS = 8000;

export async function fetchRoutePath(
  from: LatLng,
  to: LatLng,
): Promise<LatLng[] | null> {
  const key = API.directionsApiKey?.trim();
  if (!key) {
    warnOnce(
      'no-key',
      'API.directionsApiKey is empty — the ride map will draw a straight line. ' +
        'Set a key with the Directions API enabled (not the app-restricted MAPS_API_KEY).',
    );
    return null;
  }

  const legKey = `${coord(from)}>${coord(to)}`;
  const cached = cache.get(legKey);
  if (cached) {
    return cached;
  }

  const url =
    'https://maps.googleapis.com/maps/api/directions/json' +
    `?origin=${coord(from)}&destination=${coord(to)}` +
    `&mode=driving&key=${encodeURIComponent(key)}`;

  // The map is an orientation aid, not a step the driver is blocked on — a
  // request still running when they've moved on is worth nothing, so it is cut
  // rather than left to hold the leg.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: abort.signal });
    const data = await res.json().catch(() => null);

    // `status` carries the real answer — an over-quota or unauthorised call
    // still comes back `200`. Anything other than OK means no route to draw.
    //
    // A refused key is the failure worth naming: it looks identical to "no
    // route" from the map's side, and silently drawing a straight line is how
    // a misconfigured key survives a whole test round. `error_message` is
    // Google's own explanation and says exactly which restriction bit.
    if (!res.ok || data?.status !== 'OK') {
      warnOnce(
        `status:${data?.status ?? res.status}`,
        `Directions refused the request (${data?.status ?? res.status})` +
          `${data?.error_message ? `: ${data.error_message}` : ''}`,
      );
      return null;
    }

    const encoded: string | undefined = data?.routes?.[0]?.overview_polyline?.points;
    const path = encoded ? decodePolyline(encoded) : [];
    if (path.length < 2) {
      return null;
    }

    cache.set(legKey, path);
    return path;
  } catch {
    // Offline, aborted, or a malformed answer. The caller draws its fallback.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function coord(at: LatLng): string {
  return `${at.lat},${at.lng}`;
}

/** Reasons already reported, so a per-leg failure isn't logged per leg. */
const warned = new Set<string>();

/**
 * Says once, in development, why the map fell back to a straight line.
 *
 * Nothing reaches the driver: a preview that drew a plain line instead of a
 * road is not something they can act on, and it does not stop them driving.
 * The developer setting the key up is the one who needs to hear it.
 */
function warnOnce(reason: string, message: string): void {
  if (!__DEV__ || warned.has(reason)) {
    return;
  }
  warned.add(reason);
  console.warn(`[directions] ${message}`);
}

/**
 * Google's encoded polyline, unpacked.
 *
 * The format stores each point as a delta from the one before it, in units of
 * 1e-5 degrees: chunks of 5 bits, low chunk first, each with bit 6 set while
 * more chunks follow, and the whole value zig-zagged so negatives stay small.
 *
 * Bit twiddling is the format, not a cleverness — hence the rule being off for
 * this one function.
 */
/* eslint-disable no-bitwise */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += nextDelta();
    lng += nextDelta();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;

  function nextDelta(): number {
    let result = 0;
    let shift = 0;
    let chunk: number;

    do {
      chunk = encoded.charCodeAt(index++) - 63;
      result |= (chunk & 0x1f) << shift;
      shift += 5;
    } while (chunk >= 0x20 && index < encoded.length);

    // Bit 0 is the sign: odd values are negative, and the rest shifts down.
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
/* eslint-enable no-bitwise */
