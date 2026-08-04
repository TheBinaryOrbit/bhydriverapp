import { API, apiError, apiUrl, bearer } from './api';
import type { DriverReview, DriverReviewsPage } from '../types/review';

/** Page size. Matches the API's own default, and one screenful plus some. */
export const REVIEWS_PAGE_SIZE = 20;

/**
 * One page of the reviews riders left for a driver, newest first.
 *
 * The response carries a `driver` summary with `averageRating` and
 * `totalReviews` computed over every review, not just this page — so the
 * headline figures come from there and never from averaging the rows.
 */
export async function fetchDriverReviews(
  token: string,
  driverId: string,
  options: { limit?: number; skip?: number } = {},
): Promise<DriverReviewsPage> {
  const limit = options.limit ?? REVIEWS_PAGE_SIZE;
  const skip = options.skip ?? 0;

  const query = new URLSearchParams({
    limit: String(limit),
    skip: String(skip),
  });
  const res = await fetch(
    `${apiUrl(API.endpoints.reviewsByDriver)}/${driverId}?${query}`,
    { headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load your reviews');
  }

  const reviews: DriverReview[] = Array.isArray(data?.data) ? data.data : [];

  return {
    driver: data?.driver ?? null,
    reviews,
    // `count` is the server's, but fall back to what actually arrived: the
    // pager compares it against `limit` to decide whether to ask for more, and
    // a wrong number there either stops early or loops.
    count: typeof data?.count === 'number' ? data.count : reviews.length,
    skip: typeof data?.skip === 'number' ? data.skip : skip,
    limit: typeof data?.limit === 'number' ? data.limit : limit,
  };
}
