/**
 * Central API configuration.
 *
 * Endpoints follow `docs/driver-auth-onboarding.md` (base `/api/v3`). Flip
 * `useMock` to `true` to exercise the auth + onboarding UI without a server.
 */
export const API = {
  baseUrl: 'https://08wnx4c4-5000.inc1.devtunnels.ms/api/v3',
  /**
   * The previous-generation production API, still holding the vehicles drivers
   * registered before this app. Read-only and used for exactly one thing —
   * letting a returning driver import their old vehicle during onboarding — so
   * it is pinned to production rather than following `baseUrl`.
   */
  legacyBaseUrl: 'https://api.bharatyaatri.com/api/v2',
  legacyEndpoints: {
    /** Vehicles a phone number owns on v2. Append `/:phoneNumber`. */
    vehiclesByPhone: '/vehicle/get/driver',
  },
  endpoints: {
    getOtp: '/auth/otp',
    verifyOtp: '/auth/verify',
    vehicleTypes: '/vehicle-types',
    driverOnboard: '/drivers/onboard',
    driverMe: '/drivers/me',
    /**
     * Starts a Signzy DigiLocker session. Body: `{ phoneNumber }`.
     *
     * Serves both entry points — the pre-signup flow runs before any account
     * (and so any token) exists, which is why the phone number, not the token,
     * identifies the driver.
     */
    kycVerify: '/drivers/kyc/verify',
    /** KYC result for a phone number. Append `/:phoneNumber`. */
    kycStatusByPhone: '/drivers/kyc/status',
    myVehicles: '/vehicles/my',
    vehicles: '/vehicles',
    myPaymentDetails: '/payment-details/my',
    paymentDetails: '/payment-details',
    /** Driver-app content pages; append `/:idOrSlug` for a single page. */
    appContent: '/app-content/driver',
    /**
     * Reviews riders left for a driver. Append `/:driverId`, and page with
     * `?limit&skip`. Public shape — it is the same call a rider makes to read a
     * driver's profile, so it carries the driver summary alongside the list.
     */
    reviewsByDriver: '/reviews/driver',

    // QuickRide — see `docs/driver-quick-ride.md`.
    /** Role-aware "where was I?" resume call. Takes `?latitude&longitude`. */
    quickRidesLive: '/quick-rides/live',
    /** Polling fallback for the ride cards when the socket is down. */
    quickRidesAvailable: '/quick-rides/available',
    /** Ride history, newest first. */
    quickRidesMy: '/quick-rides/my',
    /** Append `/:id`, plus `/start`, `/complete` or `/cancel`. */
    quickRides: '/quick-rides',
    /** `POST` to place or lower a bid. */
    quickRideBids: '/quick-ride-bids',
    /** Live bids only — used to rebuild "bid pending" state on resume. */
    quickRideBidsMy: '/quick-ride-bids/my',

    // Outstation — see `docs/driver-outstation-ride.md`.
    /** Role-aware "where was I?" resume call. Takes `?latitude&longitude`. */
    outstationRidesLive: '/outstation-rides/live',
    /**
     * A first-class browse list, not a polling fallback: a trip departing next
     * Friday is never pushed to a driver who is offline today. Takes
     * `?latitude&longitude&bookingType=now|later`.
     */
    outstationRidesAvailable: '/outstation-rides/available',
    /** Trip history. Also takes `?by=createdAt|pickupAt`. */
    outstationRidesMy: '/outstation-rides/my',
    /** Append `/:id`, plus `/start`, `/pickup`, `/complete` or `/cancel`. */
    outstationRides: '/outstation-rides',
    /** `POST` to place or lower a bid. */
    outstationRideBids: '/outstation-ride-bids',
    /** Every standing bid — outstation bids never expire, so none are filtered. */
    outstationRideBidsMy: '/outstation-ride-bids/my',
  },
  /**
   * URLs Signzy redirects the KYC WebView to when the driver finishes.
   *
   * These mirror the backend's `SIGNZY_SUCCESS_URL` / `SIGNZY_FAILURE_URL` env
   * values and **differ per environment** — confirm them with backend for each
   * build. Success and failure currently resolve to the same URL, so hitting
   * one only means "the driver left the flow"; never infer the outcome from
   * which URL was matched. `GET /drivers/me` is the only source of truth.
   */
  kycRedirectUrls: ['https://bharatyaatri.com'] as string[],

  /** Role sent to `/auth/verify` — this is the driver app. */
  role: 'driver',
  /** Set to true to run the flow entirely on-device. */
  useMock: false,
} as const;

export function apiUrl(endpoint: string): string {
  return `${API.baseUrl}${endpoint}`;
}

export function legacyApiUrl(endpoint: string): string {
  return `${API.legacyBaseUrl}${endpoint}`;
}

/**
 * Absolute URL for a file v2 holds, built from the path it stores
 * (`/vehicle/rc/110499-1785781518608.jpg`). v2 serves its uploads off the API
 * host itself, one level above `/api/v2`, so the origin is derived from
 * `legacyBaseUrl` rather than configured separately.
 *
 * Returns `undefined` for a missing path, and passes an already-absolute URL
 * through untouched — v2 is inconsistent about which of the two it returns.
 */
export function legacyAssetUrl(path?: string | null): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const origin = API.legacyBaseUrl.replace(/\/api\/v\d+\/?$/, '');
  return `${origin}/${trimmed.replace(/^\/+/, '')}`;
}

/**
 * Origin of the realtime server — the same host as the REST API, without the
 * `/api/v3` prefix. Derived rather than configured so the two can never drift
 * when the dev tunnel changes.
 */
export const SOCKET_URL: string = API.baseUrl.replace(/\/api\/v\d+\/?$/, '');

/** `?latitude=..&longitude=..`, or `''` when GPS isn't ready yet. */
export function locationQuery(
  location?: { latitude: number; longitude: number } | null,
): string {
  return location
    ? `?latitude=${location.latitude}&longitude=${location.longitude}`
    : '';
}

/** Authorization header for the driver-only routes. */
export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type FieldError = { field?: string; message?: string };

/** Error carrying the HTTP status and the backend's per-field `errors[]`. */
export class ApiError extends Error {
  status: number;
  fieldErrors: FieldError[];

  constructor(message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Builds an `ApiError` from a failed response body, preferring the per-field
 * `errors[]` list the backend returns for 400/409 responses.
 */
export function apiError(
  data: any,
  status: number,
  fallback: string,
): ApiError {
  const fieldErrors: FieldError[] = Array.isArray(data?.errors)
    ? data.errors
    : [];
  const message =
    data?.error ??
    data?.message ??
    fieldErrors[0]?.message ??
    fallback;
  return new ApiError(message, status, fieldErrors);
}
