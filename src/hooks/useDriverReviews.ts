import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  REVIEWS_PAGE_SIZE,
  fetchDriverReviews,
} from '../services/reviewService';
import type { DriverReview, DriverReviewSummary } from '../types/review';

/**
 * The reviews riders left for this driver, paged.
 *
 * Read-only and socket-free — this is the record of what riders already said.
 * The end of the list is inferred from a short page rather than from a total,
 * because `totalReviews` counts *all* reviews while the list only ever grows by
 * what the API actually returns; trusting the total would leave the footer
 * spinning forever whenever the two disagree.
 */

export type DriverReviewsState = {
  summary: DriverReviewSummary | null;
  reviews: DriverReview[];
  loading: boolean;
  refreshing: boolean;
  /** A `loadMore` page is in flight. */
  loadingMore: boolean;
  /** Another page is worth asking for. */
  hasMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => void;
};

export function useDriverReviews(
  token: string | null,
  driverId: string | null,
): DriverReviewsState {
  const [summary, setSummary] = useState<DriverReviewSummary | null>(null);
  const [reviews, setReviews] = useState<DriverReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { t } = useTranslation();

  // `onEndReached` fires repeatedly while a fetch is in flight, so the guard
  // has to be a ref — state would still be false on the next synchronous call.
  const busy = useRef(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more', skip: number) => {
      if (!token || !driverId || busy.current) {
        if (!token || !driverId) {
          setLoading(false);
        }
        return;
      }
      busy.current = true;

      if (mode === 'refresh') {
        setRefreshing(true);
      } else if (mode === 'more') {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const page = await fetchDriverReviews(token, driverId, {
          limit: REVIEWS_PAGE_SIZE,
          skip,
        });

        setSummary(page.driver);
        setReviews(previous =>
          mode === 'more' ? [...previous, ...page.reviews] : page.reviews,
        );
        // A page shorter than asked for is the last one.
        setHasMore(page.reviews.length >= REVIEWS_PAGE_SIZE);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('reviews.loadFailed'),
        );
      } finally {
        busy.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [driverId, t, token],
  );

  useEffect(() => {
    load('initial', 0);
  }, [load]);

  const refresh = useCallback(() => load('refresh', 0), [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || busy.current) {
      return;
    }
    load('more', reviews.length);
  }, [hasMore, load, reviews.length]);

  return {
    summary,
    reviews,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  };
}
