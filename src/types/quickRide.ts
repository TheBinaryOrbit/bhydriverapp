/**
 * QuickRide domain types — see `docs/driver-quick-ride.md`.
 *
 * Two shapes of the same data flow through this app and they are easy to mix
 * up: socket payloads are flat ride *cards* keyed `rideId`, REST responses are
 * the stored *ride* document keyed `_id`. They get separate types and a single
 * normaliser (`toRideCard`) rather than one optional-everything blob — every
 * ride reaching the card list must go through it, whichever door it came in.
 */

/** Server-side lifecycle. The driver only ever sees the last four. */
export type RideStatus =
  | 'searching'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

/** Which end of the trip the driver is currently driving to. */
export type RidePhase = 'pickup' | 'drop';

/** Socket payloads send this… */
export type LatLngCoordinates = { latitude: number; longitude: number };
/** …and REST sends this — **longitude first**, per GeoJSON. */
export type GeoJsonPoint = { type: 'Point'; coordinates: [number, number] };

export type AnyCoordinates =
  LatLngCoordinates | GeoJsonPoint | null | undefined;

export type LatLng = { lat: number; lng: number };

/**
 * The one place either coordinate shape is unpacked. Everything downstream —
 * the map link, the distance badge, `driver:online` — takes a `LatLng`.
 */
export function toLatLng(coordinates: AnyCoordinates): LatLng | null {
  if (!coordinates) {
    return null;
  }
  if ('coordinates' in coordinates && Array.isArray(coordinates.coordinates)) {
    const [lng, lat] = coordinates.coordinates;
    return typeof lat === 'number' && typeof lng === 'number'
      ? { lat, lng }
      : null;
  }
  const { latitude, longitude } = coordinates as LatLngCoordinates;
  return typeof latitude === 'number' && typeof longitude === 'number'
    ? { lat: latitude, lng: longitude }
    : null;
}

/** The fare window a bid has to land inside. Re-sent on every fare raise. */
export type BidBounds = { min: number; max: number };

/** Rider / driver summary as populated on a ride. */
export type RideParty = {
  _id: string;
  name?: string;
  phoneNumber?: string;
  profileImageUrl?: string;
};

/**
 * A ride offered to the driver — the `ride:request` / `ride:fare_updated`
 * payload, and the same shape `GET /quick-rides/available` returns.
 */
export type RideCard = {
  rideId: string;
  pickupLocationName?: string;
  dropLocationName?: string;
  pickupCoordinates?: AnyCoordinates;
  dropCoordinates?: AnyCoordinates;
  vehicleTypeId?: string;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  /** The system's own estimate — a hint, never the bidding baseline. */
  suggestedFare?: number;
  /** What the rider is offering. This is the number on the card. */
  offeredFare?: number;
  bidBounds?: BidBounds;
  /** ISO timestamp; the card dies when it passes. */
  expiresAt?: string;
  distanceFromDriverKm?: number;
};

/** The short form of `ride:fare_updated` sent to drivers already holding a bid. */
export type FareUpdate = {
  rideId: string;
  offeredFare?: number;
  bidBounds?: BidBounds;
};

/** The stored ride, as returned by `GET /quick-rides/:id`. */
export type QuickRide = {
  _id: string;
  rideStatus: RideStatus;
  pickupLocationName?: string;
  dropLocationName?: string;
  pickupCoordinates?: AnyCoordinates;
  dropCoordinates?: AnyCoordinates;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  offeredFare?: number;
  /** The system's estimate, stored on the ride alongside what the rider offered. */
  suggestedFare?: number;
  /** When the search window closes. Stored, so a restored card still counts down. */
  expiresAt?: string;
  /** What the driver actually gets paid. Never show `offeredFare` instead. */
  finalFare?: number;
  startOtpAttempts?: number;
  bookedBy?: RideParty;
  assignedTo?: RideParty;
  vehicleTypeId?: {
    _id?: string;
    name?: string;
    icon?: string;
    capacity?: number;
  };
  startedAt?: string | null;
  completedAt?: string | null;
  cancellationReason?: string;
  createdAt?: string;
};

/** A bid the driver has placed. `quickRideId` is populated by `/my`. */
export type QuickRideBid = {
  _id: string;
  quickRideId: string | QuickRide;
  fare: number;
  requestStatus?: 'pending' | 'accepted' | 'rejected';
  /** 60s from placement by default. */
  expiresAt?: string;
  createdAt?: string;
};

export function bidRideId(bid: QuickRideBid): string {
  return typeof bid.quickRideId === 'string'
    ? bid.quickRideId
    : (bid.quickRideId?._id ?? '');
}

/** `GET /quick-rides/live` — the driver's copy. */
export type LiveState = {
  role?: string;
  busy: boolean;
  /**
   * Why the driver is busy. Typed loosely on purpose — availability is derived
   * from *both* ride collections, so a QuickRide driver can be blocked by an
   * outstation trip they accepted for tomorrow (`outstation_pickup_imminent`),
   * and this file must not depend on the outstation types to say so.
   */
  busyReason?: string;
  /** The server's own sentence for `busyReason`, when it sent one. */
  busyMessage?: string;
  hasLiveRide: boolean;
  rideStatus?: RideStatus;
  /** Computed server-side so the app never re-derives the phase. */
  navigateTo?: RidePhase;
  ride: QuickRide | null;
  /** You didn't send lat/lng — `availableRides` is empty *because of that*. */
  needsLocation?: boolean;
  needsVehicle?: boolean;
  bids: QuickRideBid[];
  /** Raw ride documents, **not** cards — run them through `toRideCard`. */
  availableRides: RawRideCard[];
};

/**
 * Either shape a ride can turn up in: the socket's flat card (`rideId`), or the
 * stored document REST returns on `/live` and `/available` (`_id`, with the
 * dispatch extras — `bidBounds`, `distanceFromDriver*` — bolted on by the
 * query).
 */
export type RawRideCard = Partial<Omit<RideCard, 'vehicleTypeId'>> & {
  _id?: string;
  rideStatus?: RideStatus;
  vehicleTypeId?: string | { _id?: string; name?: string };
  distanceFromDriverMeters?: number;
};

/**
 * The one door every ride card comes through. Returns `null` for anything with
 * no id, which is the only shape that can't be rendered.
 *
 * Keys the source didn't carry are **removed, not left `undefined`**: cards are
 * merged on update, and the short `ride:fare_updated` payload (`rideId`,
 * `offeredFare`, `bidBounds`) would otherwise blank out the addresses and the
 * route of the card it is meant to be patching.
 */
export function toRideCard(raw?: RawRideCard | null): RideCard | null {
  const rideId = raw?.rideId ?? raw?._id;
  if (!raw || !rideId) {
    return null;
  }

  const fields: Partial<RideCard> = {
    pickupLocationName: raw.pickupLocationName,
    dropLocationName: raw.dropLocationName,
    pickupCoordinates: raw.pickupCoordinates,
    dropCoordinates: raw.dropCoordinates,
    vehicleTypeId:
      typeof raw.vehicleTypeId === 'string'
        ? raw.vehicleTypeId
        : raw.vehicleTypeId?._id,
    estimatedDistanceKm: raw.estimatedDistanceKm,
    estimatedDurationMin: raw.estimatedDurationMin,
    suggestedFare: raw.suggestedFare,
    offeredFare: raw.offeredFare,
    bidBounds: raw.bidBounds,
    expiresAt: raw.expiresAt,
    distanceFromDriverKm: raw.distanceFromDriverKm,
  };

  const card = { rideId } as RideCard;
  Object.entries(fields).forEach(([key, value]) => {
    // `null` counts as absent, not as a value. A re-dispatch that sends
    // `bidBounds: null` is saying "not carrying this", and writing the null
    // through would blank the bid range the driver is about to bid inside.
    if (value !== undefined && value !== null) {
      (card as Record<string, unknown>)[key] = value;
    }
  });
  return card;
}

/** Seconds left until `iso`, floored at 0. `null` when there is no deadline. */
export function secondsUntil(iso?: string | null): number | null {
  if (!iso) {
    return null;
  }
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.max(0, Math.ceil(ms / 1000));
}
