import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

import { driverSocket } from '../services/driverSocket';
import type { LatLng } from '../types/quickRide';

/**
 * The driver's position, watched continuously while they are on duty.
 *
 * Every fix is pushed straight into `driverSocket` as well as into React
 * state: the socket's 5s ping reads the latest fix, and the UI reads the same
 * one for the "km away" badges and the `/live` query.
 *
 * The watch itself is a **single** module-level one, shared by every consumer
 * of this hook. Three screens call it — both home tabs and the outstation trip
 * screen — and one GPS watch per screen is three times the battery for one
 * position. It runs while at least one consumer wants it, so the trip screen
 * unmounting can no longer cut the ping out from under a rider watching the map.
 */

export type LocationPermission = 'unknown' | 'granted' | 'denied';

export type DriverLocationState = {
  location: LatLng | null;
  permission: LocationPermission;
  /** Set when the fix itself failed (GPS off, timeout) rather than permission. */
  error: string | null;
  /** Prompts for permission and takes one fix. Safe to call repeatedly. */
  request: () => Promise<LatLng | null>;
  /** Begins the continuous watch. No-op if one is already running. */
  start: () => void;
  stop: () => void;
};

/**
 * The one-shot fix, deliberately **coarse**.
 *
 * This fix does one job: place the driver in the right neighbourhood so
 * `driver:online` is accepted. A high-accuracy cold start makes the driver
 * stare at a spinning duty switch for ten or fifteen seconds waiting on
 * satellites, to answer a question the network provider answers instantly — and
 * the continuous watch below replaces it with a precise fix within seconds of
 * the switch flipping anyway. Two minutes of cache is accepted for the same
 * reason.
 */
const APPROX_FIX = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 120000,
};

/** For devices with no network provider, where the coarse attempt just fails. */
const PRECISE_FIX = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 10000,
};

const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  // 10m keeps the ping loop fed without waking the GPS on every twitch —
  // the socket pings on its own 5s timer regardless of new fixes.
  distanceFilter: 10,
  interval: 5000,
  fastestInterval: 2000,
};

/* ------------------------------------------------------------------ *
 * The shared watch
 * ------------------------------------------------------------------ */

type Subscriber = {
  /** This consumer wants the watch running. */
  wants: boolean;
  onFix: (fix: LatLng) => void;
  onError: (message: string) => void;
};

const subscribers = new Set<Subscriber>();

let watchId: number | null = null;
let lastFix: LatLng | null = null;

// `heading` and `speed` arrive as `null` on both platforms when unavailable.
function publish(
  next: LatLng,
  heading?: number | null,
  speed?: number | null,
): void {
  lastFix = next;
  driverSocket.setPosition({
    latitude: next.lat,
    longitude: next.lng,
    // Android hands back -1 for "unknown heading" while standing still,
    // and both platforms use null when the fix carries neither.
    heading: typeof heading === 'number' && heading >= 0 ? heading : undefined,
    speed: typeof speed === 'number' && speed >= 0 ? speed : undefined,
  });
  subscribers.forEach(subscriber => subscriber.onFix(next));
}

function fail(message: string): void {
  subscribers.forEach(subscriber => subscriber.onError(message));
}

/** Starts or clears the one watch to match what the consumers currently want. */
function syncWatch(): void {
  let wanted = false;
  subscribers.forEach(subscriber => {
    wanted = wanted || subscriber.wants;
  });

  if (wanted && watchId === null) {
    watchId = Geolocation.watchPosition(
      position =>
        publish(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          position.coords.heading,
          position.coords.speed,
        ),
      err => fail(err?.message ?? 'Lost your location'),
      WATCH_OPTIONS,
    );
    return;
  }

  if (!wanted && watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }
}

/**
 * Duty's own claim on the watch, held by no screen.
 *
 * Every other subscriber is a mounted component, and by the time the driver has
 * swiped the app out of recents there are none — but the shift is still running
 * and the rider is still watching the map. So duty keeps a claim of its own,
 * registered once at module load and outliving every screen. It reads no fixes:
 * `publish` feeds `driverSocket` before it notifies anyone, which is the only
 * part that matters with nothing on screen.
 */
const dutyClaim: Subscriber = {
  wants: false,
  onFix: () => {},
  onError: () => {},
};
subscribers.add(dutyClaim);

/** Begins the watch on duty's behalf. Safe to call when one is already running. */
export function startDriverWatch(): void {
  dutyClaim.wants = true;
  syncWatch();
}

/**
 * One fix, coarse first and precise only if that comes back empty — the same
 * two-stage attempt the hook makes, lifted out so the headless duty task can
 * use it with no component mounted.
 */
export function takeDriverFix(
  onError?: (message: string) => void,
): Promise<LatLng | null> {
  return new Promise<LatLng | null>(resolve => {
    const took = (position: {
      coords: {
        latitude: number;
        longitude: number;
        heading?: number | null;
        speed?: number | null;
      };
    }) => {
      const next = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      publish(next, position.coords.heading, position.coords.speed);
      resolve(next);
    };

    Geolocation.getCurrentPosition(
      took,
      // Coarse came back empty — fall through to the slow, certain one rather
      // than telling the driver their location is off when it isn't.
      () =>
        Geolocation.getCurrentPosition(
          took,
          err => {
            onError?.(err?.message ?? 'Could not get your location');
            resolve(null);
          },
          PRECISE_FIX,
        ),
      APPROX_FIX,
    );
  });
}

/**
 * Ends the watch for **every** consumer, duty's own claim included.
 *
 * Going off duty is the one event that means nobody needs the GPS any more, and
 * it can be tapped from either tab. A consumer-by-consumer stop would leave the
 * other tab's claim standing and the GPS running for an offline driver, which
 * is the exact battery complaint the shared watch exists to avoid.
 */
export function stopDriverWatch(): void {
  subscribers.forEach(subscriber => {
    subscriber.wants = false;
  });
  syncWatch();
}

/** The last fix this app has seen, from any consumer. */
export function lastKnownFix(): LatLng | null {
  if (lastFix) {
    return lastFix;
  }
  const at = driverSocket.position;
  return at ? { lat: at.latitude, lng: at.longitude } : null;
}

/* ------------------------------------------------------------------ */

export function useDriverLocation(): DriverLocationState {
  const [location, setLocation] = useState<LatLng | null>(() => lastFix);
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const self = useRef<Subscriber>({
    wants: false,
    onFix: next => {
      if (mounted.current) {
        setLocation(next);
        setError(null);
      }
    },
    onError: message => {
      if (mounted.current) {
        setError(message);
      }
    },
  });

  useEffect(() => {
    mounted.current = true;
    const me = self.current;
    subscribers.add(me);

    return () => {
      mounted.current = false;
      // Leaving drops this screen's claim on the watch, not the watch itself —
      // another screen, or an on-duty ping, may still be living off it.
      me.wants = false;
      subscribers.delete(me);
      syncWatch();
    };
  }, []);

  const request = useCallback(async (): Promise<LatLng | null> => {
    const granted = await ensurePermission();
    if (mounted.current) {
      setPermission(granted ? 'granted' : 'denied');
    }
    if (!granted) {
      return null;
    }

    return takeDriverFix(message => {
      if (mounted.current) {
        setError(message);
      }
    });
  }, []);

  const start = useCallback(() => {
    self.current.wants = true;
    syncWatch();
  }, []);

  const stop = useCallback(() => {
    self.current.wants = false;
    syncWatch();
  }, []);

  return { location, permission, error, request, start, stop };
}

/**
 * iOS asks through the plist entry on first use, so only Android needs an
 * explicit request. Coarse-only is accepted: Android 12+ lets the driver grant
 * just that, and dispatch still works, only less precisely.
 */
async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    Geolocation.requestAuthorization();
    return true;
  }

  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);

  return (
    results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED ||
    results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED
  );
}
