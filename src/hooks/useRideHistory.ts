import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchMyRides,
  type RideHistoryFilter,
} from '../services/quickRideService';
import type { QuickRide } from '../types/quickRide';

export type RideHistoryState = {
  rides: QuickRide[];
  /** A fetch is in flight and the list on screen doesn't answer it yet. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * The driver's finished rides from `GET /quick-rides/my`, newest first.
 *
 * Read-only and deliberately socket-free: this is the record of what already
 * happened, so nothing here reacts to live events — `useQuickRide` owns those.
 * The server's ordering is kept as-is rather than re-sorted, since a ride can
 * be ordered by any of `completedAt` / `cancelledAt` / `createdAt` depending on
 * how it ended and only the server knows which applied.
 *
 * Filtering is server-side. `filter` must be referentially stable — a fresh
 * object every render would refetch on every render.
 */
export function useRideHistory(
  token: string | null,
  filter?: RideHistoryFilter,
): RideHistoryState {
  const [rides, setRides] = useState<QuickRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!token) {
        // Nothing to fetch yet — `useAuth` reads the token asynchronously, so
        // this runs once before it lands and again with it.
        setLoading(false);
        return;
      }
      // A changed filter comes through as `initial`: the rides on screen answer
      // the old query, so the list steps aside for a spinner rather than
      // showing rows the driver just filtered out.
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        setRides(await fetchMyRides(token, filter));
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load your rides',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, token],
  );

  const refresh = useCallback(() => load('refresh'), [load]);

  useEffect(() => {
    load('initial');
  }, [load]);

  // The tab stays mounted behind the rest of the app, so a ride finished after
  // this list was built would never appear. Pull again on every return to it;
  // the first focus is skipped because the initial load is already running.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focused.current) {
        focused.current = true;
        return;
      }
      refresh();
    }, [refresh]),
  );

  return { rides, loading, refreshing, error, refresh };
}
