import { API } from './api';
import type { LatLng } from '../types/quickRide';

/**
 * The driving route between two points, as the road actually runs.
 *
 * `POST routes.googleapis.com/directions/v2:computeRoutes` — Google's Routes
 * API, called straight from the app because nothing on our own API returns a
 * route.
 *
 * **Not the legacy Directions API**, which is what this file called when it was
 * `directionsService` and why it never drew a road. That API cannot work here:
 * Google no longer lets a project enable the legacy Maps web services, so
 * `maps/api/directions/json` answers `REQUEST_DENIED` with "You're calling a
 * legacy API" no matter which key is used. Routes API is its replacement, and
 * it has to be enabled on the Cloud project before any of this draws a road.
 *
 * Two more things have to be true, both of them console-side:
 *
 * - **A key of its own** (`API.routesApiKey`), not the `MAPS_API_KEY` the
 *   native SDKs use. This is a web-service call, and Google rejects an
 *   app-restricted key on one.
 * - **A restriction on that key**, because it ships in the JS bundle. An
 *   IP/referrer restriction plus a tight quota is the least of it.
 *
 * When any of that is missing every call here returns `null` and the map draws
 * no line at all. There is no straight-line fallback any more, on purpose: it
 * was indistinguishable from a genuinely straight road, so a refused key read
 * as a short trip rather than as a failure.
 *
 * The right home for this is a backend endpoint that holds the key and proxies
 * the call. Until that exists, this is the version that keeps the key in one
 * named place instead of scattered through the map component.
 */

/** Routes already fetched this app run, keyed by leg. */
const cache = new Map<string, LatLng[]>();

/** How long a route request is worth waiting for on a phone in a car. */
const TIMEOUT_MS = 8000;

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Asks for the encoded line and nothing else.
 *
 * The field mask is required — Routes refuses a request without one — and it is
 * also the bill: the response fields asked for decide which SKU the call lands
 * in. Polyline alone keeps it in the cheapest one. Adding `routes.legs` or
 * anything traffic-aware moves it up a tier, so add a field here only when
 * something on screen actually reads it.
 */
const FIELD_MASK = 'routes.polyline.encodedPolyline';

export async function fetchRoutePath(
  from: LatLng,
  to: LatLng,
): Promise<LatLng[] | null> {
  const key = API.routesApiKey?.trim();
  if (!key) {
    warnOnce(
      'no-key',
      'API.routesApiKey is empty — the ride map will draw a straight line. ' +
        'Set a key with the Routes API enabled (not the app-restricted MAPS_API_KEY).',
    );
    return null;
  }

  const legKey = `${coord(from)}>${coord(to)}`;
  const cached = cache.get(legKey);
  if (cached) {
    return cached;
  }

  // The map is an orientation aid, not a step the driver is blocked on — a
  // request still running when they've moved on is worth nothing, so it is cut
  // rather than left to hold the leg.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        origin: waypoint(from),
        destination: waypoint(to),
        travelMode: 'DRIVE',
        // Left traffic-unaware on purpose. This line is drawn once when the leg
        // begins and never re-fetched, so a traffic-aware route would be stale
        // within minutes — and it costs a dearer SKU to be stale in.
        polylineQuality: 'OVERVIEW',
      }),
    });

    const data = await res.json().catch(() => null);

    // Routes answers a refusal with an HTTP error and a `error.message` that
    // names the cause exactly — a disabled API, a restricted key, a spent
    // quota. That is the failure worth naming: from the map's side it looks
    // identical to "no route", and silently drawing a straight line is how a
    // misconfigured project survives a whole test round.
    if (!res.ok) {
      warnOnce(
        `status:${data?.error?.status ?? res.status}`,
        `Routes refused the request (${data?.error?.status ?? res.status})` +
          `${data?.error?.message ? `: ${data.error.message}` : ''}`,
      );
      return null;
    }

    // A `200` with no route is a real answer: no drivable way between the two
    // points. Nothing to warn about, and nothing to draw.
    const encoded: string | undefined =
      data?.routes?.[0]?.polyline?.encodedPolyline;
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

/** A point in the shape Routes takes for `origin` and `destination`. */
function waypoint(at: LatLng) {
  return { location: { latLng: { latitude: at.lat, longitude: at.lng } } };
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
  console.warn(`[routes] ${message}`);
}

/**
 * Google's encoded polyline, unpacked.
 *
 * The format stores each point as a delta from the one before it, in units of
 * 1e-5 degrees: chunks of 5 bits, low chunk first, each with bit 6 set while
 * more chunks follow, and the whole value zig-zagged so negatives stay small.
 * Routes returns the same encoding the legacy service did, so this is unchanged.
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
