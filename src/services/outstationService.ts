import { API, apiError, apiUrl, bearer, locationQuery } from './api';
import type { RidePaymentDetails } from '../types/driver';
import type {
  BookingType,
  BusyReason,
  OutstationBid,
  OutstationLiveState,
  OutstationRide,
  OutstationRideStatus,
  RawOutstationCard,
} from '../types/outstation';
import type { LatLng } from '../types/quickRide';

/**
 * REST for outstation trips — see `docs/driver-outstation-ride.md` §Endpoints.
 *
 * Deliberately a sibling of `quickRideService` rather than a generalisation of
 * it: the two products share a base URL and an auth header and almost nothing
 * else. The driver has **two** actions here where QuickRide has one, bids carry
 * no expiry, and every "you can't take this" answer arrives as a `409` with a
 * machine-readable `reason` this module preserves.
 */

function asQuery(location?: LatLng | null) {
  return locationQuery(
    location ? { latitude: location.lat, longitude: location.lng } : null,
  );
}

function jsonHeaders(token: string): Record<string, string> {
  return { ...bearer(token), 'Content-Type': 'application/json' };
}

/** The `busyReason` codes the app knows how to phrase. */
const BUSY_REASONS: BusyReason[] = [
  'active_quick_ride',
  'active_outstation_ride',
  'outstation_pickup_imminent',
];

/** Narrows an unknown `busyReason` to the union, or drops it. */
function busyReason(value: unknown): BusyReason | undefined {
  return BUSY_REASONS.includes(value as BusyReason)
    ? (value as BusyReason)
    : undefined;
}

/**
 * `GET /outstation-rides/live` — **the first call on every app open and
 * resume**, exactly as its QuickRide twin is.
 *
 * The rider branch of this endpoint returns an array; the driver branch returns
 * the object read below, so nothing here has to handle both.
 */
export async function fetchOutstationLiveState(
  token: string,
  location?: LatLng | null,
): Promise<OutstationLiveState> {
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRidesLive)}${asQuery(location)}`,
    { headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load your trip status');
  }

  return {
    role: data?.role,
    busy: data?.busy === true,
    busyReason: busyReason(data?.busyReason),
    busyMessage: data?.message ?? data?.busyMessage,
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

export type AvailableOutstationRides = {
  busy: boolean;
  busyReason?: BusyReason;
  busyMessage?: string;
  /** Raw documents, same as `/live` — normalise with `toOutstationCard`. */
  rides: RawOutstationCard[];
};

/**
 * `GET /outstation-rides/available` — the browse list.
 *
 * Unlike its QuickRide counterpart this is not a fallback for a dead socket: a
 * trip scheduled for next week is *only* ever discovered here, because it was
 * dispatched at a moment this driver may not have been online for.
 */
export async function fetchAvailableOutstationRides(
  token: string,
  location: LatLng,
  bookingType?: BookingType,
): Promise<AvailableOutstationRides> {
  const query = `${asQuery(location)}${
    bookingType ? `&bookingType=${bookingType}` : ''
  }`;
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRidesAvailable)}${query}`,
    { headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load nearby trips');
  }
  return {
    busy: data?.busy === true,
    busyReason: busyReason(data?.busyReason),
    busyMessage: data?.message ?? data?.busyMessage,
    rides: Array.isArray(data?.data) ? data.data : [],
  };
}

/** `GET /outstation-rides/:id` — the source of truth behind the trip screen. */
export async function fetchOutstationRide(
  token: string,
  rideId: string,
): Promise<OutstationRide> {
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRides)}/${rideId}`,
    { headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ride) {
    throw apiError(data, res.status, 'Failed to load the trip');
  }
  return data.ride;
}

/**
 * `PATCH /outstation-rides/:id/start` — **no body and no OTP.**
 *
 * `assigned → arriving`, which is the moment tracking switches on: from here
 * the driver's `driver:location` pings reach the rider's map and the share link
 * they may have sent to family. A `409` means the trip was not `assigned` —
 * already started, or cancelled underneath us.
 */
export async function startOutstationRide(
  token: string,
  rideId: string,
): Promise<{ ride: OutstationRide; trackingUrl?: string }> {
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRides)}/${rideId}/start`,
    { method: 'PATCH', headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ride) {
    throw apiError(data, res.status, 'Failed to start the trip');
  }
  return { ride: data.ride, trackingUrl: data.trackingUrl };
}

/**
 * `PATCH /outstation-rides/:id/pickup` — the rider reads the OTP out loud.
 *
 * `arriving → in_progress`, and tracking goes **off** again: the room is torn
 * down and the share link dies. `400` carries `attemptsRemaining`; `423` means
 * the trip is locked for good after 5 wrong tries and the only way out is
 * cancelling; `409` means `/start` never happened.
 */
export async function pickupOutstationRide(
  token: string,
  rideId: string,
  startOtp: string,
): Promise<OutstationRide> {
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRides)}/${rideId}/pickup`,
    {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ startOtp }),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ride) {
    const error = apiError(data, res.status, 'Failed to confirm the pickup');
    (error as OutstationOtpError).attemptsRemaining = data?.attemptsRemaining;
    throw error;
  }
  return data.ride;
}

/** An `ApiError` from `/pickup` also carries how many tries are left. */
export type OutstationOtpError = Error & { attemptsRemaining?: number };

/**
 * `PATCH /outstation-rides/:id/complete` — closes the trip and frees the
 * driver for both products.
 *
 * `paymentDetails` is the driver's own payee record, sent along so the success
 * screen can put a UPI QR up without a second round trip.
 */
export async function completeOutstationRide(
  token: string,
  rideId: string,
): Promise<{ ride: OutstationRide; paymentDetails?: RidePaymentDetails }> {
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRides)}/${rideId}/complete`,
    { method: 'PATCH', headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ride) {
    throw apiError(data, res.status, 'Failed to complete the trip');
  }
  return { ride: data.ride, paymentDetails: data.paymentDetails ?? undefined };
}

/*
 * There is deliberately no `cancelOutstationRide` here.
 *
 * `PATCH /outstation-rides/:id/cancel` still exists and the rider still uses it
 * — `outstation:ride_cancelled` is handled on the trip screen. The driver has
 * no way to call it: a committed trip is a promise a rider has planned days
 * around.
 *
 * The one case this used to cover was the OTP lockout, where cancelling was the
 * documented way out. That is now a support case — see `otpLockedBody`.
 */

/**
 * Query filters for `GET /outstation-rides/my`. All optional and combinable.
 *
 * Dates are `YYYY-MM-DD` **IST calendar days** — build them with `presetRange`.
 * `by` picks which timestamp the date range is measured against, and is the one
 * filter QuickRide has no use for: "trips I booked last week" and "trips
 * departing next week" are different questions on this product.
 */
export type OutstationHistoryFilter = {
  status?: OutstationRideStatus[];
  date?: string;
  from?: string;
  to?: string;
  /** Defaults to `createdAt` server-side. */
  by?: 'createdAt' | 'pickupAt';
};

function historyQuery(filter?: OutstationHistoryFilter): string {
  const params: string[] = [];

  // An unrecognised status is a 400, so only the typed union goes out.
  if (filter?.status?.length) {
    params.push(`status=${filter.status.join(',')}`);
  }
  (['date', 'from', 'to', 'by'] as const).forEach(key => {
    const value = filter?.[key];
    if (value) {
      params.push(`${key}=${value}`);
    }
  });

  return params.length > 0 ? `?${params.join('&')}` : '';
}

/** `GET /outstation-rides/my` — history. This is **not** the resume call. */
export async function fetchMyOutstationRides(
  token: string,
  filter?: OutstationHistoryFilter,
): Promise<OutstationRide[]> {
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRidesMy)}${historyQuery(filter)}`,
    { headers: bearer(token) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load your trips');
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/* ------------------------------------------------------------------ *
 * Bids
 * ------------------------------------------------------------------ */

/**
 * A rejected bid tells you how to fix the sheet.
 *
 * `reason` is the outstation-only field: a `409` carrying one means the driver
 * is *blocked* — an active QuickRide, an active trip, or a pickup inside the
 * two-hour window — rather than the trip being gone. The two need different
 * handling, so the code is preserved rather than flattened into a message.
 */
export type OutstationBidError = Error & {
  bidBounds?: { min: number; max: number };
  currentBid?: number;
  reason?: BusyReason;
};

/**
 * `POST /outstation-ride-bids` — places a bid, or **lowers** an existing one on
 * the same trip. The placed bid has no expiry and stays on the rider's screen
 * until something explicitly removes it.
 */
export async function placeOutstationBid(
  token: string,
  outstationRideId: string,
  fare: number,
): Promise<OutstationBid> {
  const res = await fetch(apiUrl(API.endpoints.outstationRideBids), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ outstationRideId, fare }),
  });
  const data = await res.json().catch(() => null);
  if (res.status !== 201 || !data?.bid) {
    const error = apiError(data, res.status, 'Failed to place your bid');
    const bidError = error as OutstationBidError;
    bidError.bidBounds = data?.bidBounds;
    bidError.currentBid = data?.currentBid;
    bidError.reason = busyReason(data?.reason);
    throw error;
  }
  return data.bid;
}

/**
 * `GET /outstation-ride-bids/my` — every standing bid, each with the trip
 * populated. No expiry filter, because there is no expiry.
 */
export async function fetchMyOutstationBids(
  token: string,
): Promise<OutstationBid[]> {
  const res = await fetch(apiUrl(API.endpoints.outstationRideBidsMy), {
    headers: bearer(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load your bids');
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/** `DELETE /outstation-ride-bids/:id/withdraw`. An accepted bid is a `409`. */
export async function withdrawOutstationBid(
  token: string,
  bidId: string,
): Promise<void> {
  const res = await fetch(
    `${apiUrl(API.endpoints.outstationRideBids)}/${bidId}/withdraw`,
    { method: 'DELETE', headers: bearer(token) },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw apiError(data, res.status, 'Failed to withdraw your bid');
  }
}
