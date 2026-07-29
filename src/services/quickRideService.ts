import { API, apiError, apiUrl, bearer, locationQuery } from './api';
import type { RidePaymentDetails } from '../types/driver';
import type {
  LatLng,
  LiveState,
  QuickRide,
  QuickRideBid,
  RawRideCard,
} from '../types/quickRide';

/** `{ latitude, longitude }` as the REST query params want it. */
function asQuery(location?: LatLng | null) {
  return locationQuery(
    location ? { latitude: location.lat, longitude: location.lng } : null,
  );
}

function jsonHeaders(token: string): Record<string, string> {
  return { ...bearer(token), 'Content-Type': 'application/json' };
}

/**
 * `GET /quick-rides/live` — **the first call on every app open and resume.**
 *
 * One round trip answers "where was I?": the active ride and its phase, the
 * bids still running, and the nearby cards. Coordinates are optional; without
 * them `availableRides` comes back empty and `needsLocation` says why.
 */
export async function fetchLiveState(
  token: string,
  location?: LatLng | null,
): Promise<LiveState> {
  const res = await fetch(
    `${apiUrl(API.endpoints.quickRidesLive)}${asQuery(location)}`,
    { headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load your ride status');
  }

  // The endpoint promises arrays are always arrays, but a driver stuck on a
  // broken build because of one missing field is not a trade worth making.
  return {
    role: data?.role,
    busy: data?.busy === true,
    hasLiveRide: data?.hasLiveRide === true,
    rideStatus: data?.rideStatus,
    navigateTo: data?.navigateTo,
    ride: data?.ride ?? null,
    needsLocation: data?.needsLocation === true,
    needsVehicle: data?.needsVehicle === true,
    bids: Array.isArray(data?.bids) ? data.bids : [],
    availableRides: Array.isArray(data?.availableRides)
      ? data.availableRides
      : [],
  };
}

/** `rides` are raw documents, same as `/live` — normalise with `toRideCard`. */
export type AvailableRides = { busy: boolean; rides: RawRideCard[] };

/**
 * `GET /quick-rides/available` — the polling fallback for when the socket is
 * down. `busy: true` means the driver is mid-ride and the empty list is a
 * consequence of that, not an absence of work.
 */
export async function fetchAvailableRides(
  token: string,
  location: LatLng,
): Promise<AvailableRides> {
  const res = await fetch(
    `${apiUrl(API.endpoints.quickRidesAvailable)}${asQuery(location)}`,
    { headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 400 = bad coords, 409 = no vehicle registered. Both carry a message.
    throw apiError(data, res.status, 'Failed to load nearby rides');
  }
  return {
    busy: data?.busy === true,
    rides: Array.isArray(data?.data) ? data.data : [],
  };
}

/** `GET /quick-rides/:id` — the source of truth behind the details screen. */
export async function fetchRide(
  token: string,
  rideId: string,
): Promise<QuickRide> {
  const res = await fetch(`${apiUrl(API.endpoints.quickRides)}/${rideId}`, {
    headers: bearer(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ride) {
    throw apiError(data, res.status, 'Failed to load the ride');
  }
  return data.ride;
}

/**
 * `PATCH /quick-rides/:id/start` — the rider reads the OTP out loud.
 *
 * `400` carries `attemptsRemaining`; `423` means the ride is locked for good
 * after 5 wrong tries and the only way out is cancelling. Both are surfaced
 * through `ApiError.status` so the screen can tell them apart.
 */
export async function startRide(
  token: string,
  rideId: string,
  startOtp: string,
): Promise<{ ride: QuickRide; attemptsRemaining?: number }> {
  const res = await fetch(
    `${apiUrl(API.endpoints.quickRides)}/${rideId}/start`,
    {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ startOtp }),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = apiError(data, res.status, 'Failed to start the ride');
    (error as ApiErrorWithAttempts).attemptsRemaining = data?.attemptsRemaining;
    throw error;
  }
  return { ride: data.ride };
}

/** An `ApiError` from `/start` also carries how many tries are left. */
export type ApiErrorWithAttempts = Error & { attemptsRemaining?: number };

/**
 * `PATCH /quick-rides/:id/complete` — closes the trip **and frees the driver**,
 * so new `ride:request` events resume the moment this returns.
 *
 * `paymentDetails` is the driver's own payee record, sent along so the success
 * screen can put a UPI QR up without a second round trip. It is absent for a
 * driver who never saved a UPI id.
 */
export async function completeRide(
  token: string,
  rideId: string,
): Promise<{ ride: QuickRide; paymentDetails?: RidePaymentDetails }> {
  const res = await fetch(
    `${apiUrl(API.endpoints.quickRides)}/${rideId}/complete`,
    { method: 'PATCH', headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ride) {
    throw apiError(data, res.status, 'Failed to complete the ride');
  }
  return { ride: data.ride, paymentDetails: data.paymentDetails ?? undefined };
}

/**
 * `PATCH /quick-rides/:id/cancel` — allowed from `searching` and `assigned`
 * only. Mid-trip is a support case, and the server answers `409`.
 */
export async function cancelRide(
  token: string,
  rideId: string,
  cancellationReason: string,
): Promise<QuickRide> {
  const res = await fetch(
    `${apiUrl(API.endpoints.quickRides)}/${rideId}/cancel`,
    {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ cancellationReason }),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ride) {
    throw apiError(data, res.status, 'Failed to cancel the ride');
  }
  return data.ride;
}

/**
 * `GET /quick-rides/my` — history, newest first. This is **not** the resume
 * call; `fetchLiveState` is.
 */
export async function fetchMyRides(token: string): Promise<QuickRide[]> {
  const res = await fetch(apiUrl(API.endpoints.quickRidesMy), {
    headers: bearer(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load your rides');
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/* ------------------------------------------------------------------ *
 * Bids
 * ------------------------------------------------------------------ */

/**
 * `POST /quick-ride-bids` — places a bid, or **lowers** an existing one on the
 * same ride. Re-bidding higher is a `400` carrying `currentBid`; the fare has
 * to sit inside `bidBounds`, and a violation returns the bounds to clamp to.
 */
export async function placeBid(
  token: string,
  quickRideId: string,
  fare: number,
): Promise<QuickRideBid> {
  const res = await fetch(apiUrl(API.endpoints.quickRideBids), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ quickRideId, fare }),
  });
  const data = await res.json().catch(() => null);
  if (res.status !== 201 || !data?.bid) {
    const error = apiError(data, res.status, 'Failed to place your bid');
    const bidError = error as BidError;
    bidError.bidBounds = data?.bidBounds;
    bidError.currentBid = data?.currentBid;
    throw error;
  }
  return data.bid;
}

/**
 * A rejected bid tells you how to fix the slider: `bidBounds` when the fare was
 * outside the window, `currentBid` when it was above your own standing bid.
 */
export type BidError = Error & {
  bidBounds?: { min: number; max: number };
  currentBid?: number;
};

/** `GET /quick-ride-bids/my` — live bids only, each with the ride populated. */
export async function fetchMyBids(token: string): Promise<QuickRideBid[]> {
  const res = await fetch(apiUrl(API.endpoints.quickRideBidsMy), {
    headers: bearer(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load your bids');
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/** `DELETE /quick-ride-bids/:id/withdraw`. An accepted bid is a `409`. */
export async function withdrawBid(token: string, bidId: string): Promise<void> {
  const res = await fetch(
    `${apiUrl(API.endpoints.quickRideBids)}/${bidId}/withdraw`,
    { method: 'DELETE', headers: bearer(token) },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw apiError(data, res.status, 'Failed to withdraw your bid');
  }
}
