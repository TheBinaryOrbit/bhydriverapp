/** Ratings riders left for a driver — `GET /reviews/driver/:driverId`. */

/** The rider who wrote it, as populated on the review. */
export type ReviewAuthor = {
  _id: string;
  name?: string;
  profileImageUrl?: string;
};

export type DriverReview = {
  _id: string;
  /** Populated. A review with no author still renders — see `MyReviewsScreen`. */
  userId?: ReviewAuthor;
  driverId: string;
  /** 1–5. */
  rating: number;
  /** Optional: plenty of riders rate without writing anything. */
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * The driver header the endpoint returns beside the list. `averageRating` and
 * `totalReviews` are computed over **all** reviews, not just the page — which
 * is why the summary is worth reading off the response rather than the rows.
 */
export type DriverReviewSummary = {
  driverId: string;
  name?: string;
  profileImageUrl?: string;
  vehicleImageUrl?: string;
  averageRating?: number;
  totalReviews?: number;
};

export type DriverReviewsPage = {
  driver: DriverReviewSummary | null;
  reviews: DriverReview[];
  /** Rows in this page — compare with the requested `limit` to know if more exist. */
  count: number;
  skip: number;
  limit: number;
};
