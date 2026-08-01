import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchMyOutstationRides,
  type OutstationHistoryFilter,
} from '../services/outstationService';
import {
  fetchMyRides,
  type RideHistoryFilter,
} from '../services/quickRideService';
import type { OutstationRide } from '../types/outstation';
import type { QuickRide } from '../types/quickRide';

export type HistoryState<TRide> = {
  rides: TRide[];
  /** A fetch is in flight and the list on screen doesn't answer it yet. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export type RideHistoryState = HistoryState<QuickRide>;
export type OutstationHistoryState = HistoryState<OutstationRide>;

/**
 * The driver's finished rides, whichever product they belong to.
 *
 * Read-only and deliberately socket-free: this is the record of what already
 * happened, so nothing here reacts to live events — `useQuickRide` and
 * `useOutstation` own those. The server's ordering is kept as-is rather than
 * re-sorted, since a ride can be ordered by any of `completedAt` /
 * `cancelledAt` / `createdAt` depending on how it ended and only the server
 * knows which applied.
 *
 * Filtering is server-side. `filter` must be referentially stable — a fresh
 * object every render would refetch on every render — and `fetcher` must be a
 * module-level function for the same reason.
 */
function useHistory<TRide, TFilter>(
  token: string | null,
  filter: TFilter | undefined,
  fetcher: (token: string, filter?: TFilter) => Promise<TRide[]>,
  fallbackError: string,
): HistoryState<TRide> {
  const [rides, setRides] = useState<TRide[]>([]);
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
        setRides(await fetcher(token, filter));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackError);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fallbackError, fetcher, filter, token],
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

/** `GET /quick-rides/my`, newest first. */
export function useRideHistory(
  token: string | null,
  filter?: RideHistoryFilter,
): RideHistoryState {
  return useHistory(token, filter, fetchMyRides, 'Failed to load your rides');
}

/** `GET /outstation-rides/my`. `filter.by` picks which date the range means. */
export function useOutstationHistory(
  token: string | null,
  filter?: OutstationHistoryFilter,
): OutstationHistoryState {
  return useHistory(
    token,
    filter,
    fetchMyOutstationRides,
    'Failed to load your trips',
  );
}
