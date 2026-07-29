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

export function useDriverLocation(): DriverLocationState {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [error, setError] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (watchId.current !== null) {
        Geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, []);

  // `heading` and `speed` arrive as `null` on both platforms when unavailable.
  const publish = useCallback(
    (next: LatLng, heading?: number | null, speed?: number | null) => {
      driverSocket.setPosition({
        latitude: next.lat,
        longitude: next.lng,
        // Android hands back -1 for "unknown heading" while standing still,
        // and both platforms use null when the fix carries neither.
        heading:
          typeof heading === 'number' && heading >= 0 ? heading : undefined,
        speed: typeof speed === 'number' && speed >= 0 ? speed : undefined,
      });
      if (mounted.current) {
        setLocation(next);
        setError(null);
      }
    },
    [],
  );

  const request = useCallback(async (): Promise<LatLng | null> => {
    const granted = await ensurePermission();
    if (mounted.current) {
      setPermission(granted ? 'granted' : 'denied');
    }
    if (!granted) {
      return null;
    }

    return new Promise<LatLng | null>(resolve => {
      Geolocation.getCurrentPosition(
        position => {
          const next = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          publish(next, position.coords.heading, position.coords.speed);
          resolve(next);
        },
        err => {
          if (mounted.current) {
            setError(err?.message ?? 'Could not get your location');
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      );
    });
  }, [publish]);

  const start = useCallback(() => {
    if (watchId.current !== null) {
      return;
    }
    watchId.current = Geolocation.watchPosition(
      position =>
        publish(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          position.coords.heading,
          position.coords.speed,
        ),
      err => {
        if (mounted.current) {
          setError(err?.message ?? 'Lost your location');
        }
      },
      {
        enableHighAccuracy: true,
        // 10m keeps the ping loop fed without waking the GPS on every twitch —
        // the socket pings on its own 5s timer regardless of new fixes.
        distanceFilter: 10,
        interval: 5000,
        fastestInterval: 2000,
      },
    );
  }, [publish]);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      Geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
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
