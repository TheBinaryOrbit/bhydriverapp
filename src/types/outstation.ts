/**
 * Outstation domain types — see `docs/driver-outstation-ride.md`.
 *
 * Long-distance trips live in their own collection with their own lifecycle,
 * but they reuse QuickRide's coordinate, party and fare-bound shapes verbatim —
 * so those are imported rather than duplicated. What is genuinely different
 * gets a type of its own here:
 *
 * - an extra `arriving` status between `assigned` and `in_progress`,
 * - a `pickupAt` that can be days away, and the `bookingType` that produced it,
 * - bids that **never expire**.
 */

import type {
  AnyCoordinates,
  BidBounds,
  RideParty,
} from './quickRide';

export type { AnyCoordinates, BidBounds, RideParty };

/**
 * Server-side lifecycle.
 *
 * `arriving` is the one QuickRide has no equivalent for: the driver has said
 * they are setting off but the rider is not aboard yet. It is also the **only**
 * status in which the driver's position is broadcast — see `docs` rule 3.
 */
export type OutstationRideStatus =
  | 'searching'
  | 'assigned'
  | 'arriving'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

/** Which end of the trip the driver is currently driving to. */
export type OutstationPhase = 'pickup' | 'drop';

/** `now` departs immediately; `later` carries a scheduled `pickupAt`. */
export type BookingType = 'now' | 'later';

/**
 * Why the driver cannot take work, as reported by `/available` and `/live`.
 *
 * Each one is a different sentence to the driver, which is the whole reason the
 * server sends a code rather than only prose.
 */
export type BusyReason =
  | 'active_quick_ride'
  | 'active_outstation_ride'
  | 'outstation_pickup_imminent';

/**
 * A trip offered to the driver — the `outstation:request` payload, and the same
 * shape `GET /outstation-rides/available` returns.
 */
export type OutstationCard = {
  rideId: string;
  pickupLocationName?: string;
  dropLocationName?: string;
  pickupCoordinates?: AnyCoordinates;
  dropCoordinates?: AnyCoordinates;
  vehicleTypeId?: string;
  vehicleTypeName?: string;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  /** The system's own estimate — a hint, never the bidding baseline. */
  suggestedFare?: number;
  /** What the rider is offering. This is the number on the card. */
  offeredFare?: number;
  bidBounds?: BidBounds;
  /** When the trip departs. The headline on an outstation card. */
  pickupAt?: string;
  bookingType?: BookingType;
  /**
   * `createdAt + 24h`, capped at `pickupAt` for `later` bookings only. Long
   * enough that a live countdown is noise until the last hour of it.
   */
  expiresAt?: string;
  distanceFromDriverKm?: number;
};

/** The stored trip, as returned by `GET /outstation-rides/:id`. */
export type OutstationRide = {
  _id: string;
  rideStatus: OutstationRideStatus;
  pickupLocationName?: string;
  dropLocationName?: string;
  pickupCoordinates?: AnyCoordinates;
  dropCoordinates?: AnyCoordinates;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  offeredFare?: number;
  suggestedFare?: number;
  /** What the driver actually gets paid. Never show `offeredFare` instead. */
  finalFare?: number;
  pickupAt?: string;
  bookingType?: BookingType;
  expiresAt?: string;
  startOtpAttempts?: number;
  bookedBy?: RideParty;
  assignedTo?: RideParty;
  vehicleTypeId?: {
    _id?: string;
    name?: string;
    icon?: string;
    capacity?: number;
  };
  /** Set by `/start` — when the driver set off, **not** when the rider boarded. */
  startedAt?: string | null;
  /** Set by `/pickup` — the rider is aboard. */
  pickedUpAt?: string | null;
  completedAt?: string | null;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt?: string;
};

/**
 * A bid the driver has placed. `outstationRideId` is populated by `/my`.
 *
 * There is no `expiresAt`: an outstation bid stays on the rider's screen until
 * something explicitly removes it.
 */
export type OutstationBid = {
  _id: string;
  outstationRideId: string | OutstationRide;
  fare: number;
  requestStatus?: 'pending' | 'accepted' | 'rejected';
  createdAt?: string;
};

export function outstationBidRideId(bid: OutstationBid): string {
  return typeof bid.outstationRideId === 'string'
    ? bid.outstationRideId
    : (bid.outstationRideId?._id ?? '');
}

/** `GET /outstation-rides/live` — the driver's branch. */
export type OutstationLiveState = {
  role?: string;
  busy: boolean;
  /** Why `busy`, when the server said. Absent while the driver is free. */
  busyReason?: BusyReason;
  /** The server's own sentence for `busyReason` — worth showing verbatim. */
  busyMessage?: string;
  hasLiveRide: boolean;
  rideStatus?: OutstationRideStatus;
  /** Computed server-side so the app never re-derives the phase. */
  navigateTo?: OutstationPhase;
  ride: OutstationRide | null;
  needsLocation?: boolean;
  needsVehicle?: boolean;
  bids: OutstationBid[];
  /** Raw trip documents, **not** cards — run them through `toOutstationCard`. */
  availableRides: RawOutstationCard[];
};

/**
 * Either shape a trip can turn up in: the socket's flat card (`rideId`), or the
 * stored document REST returns on `/live` and `/available` (`_id`, with the
 * dispatch extras bolted on by the query).
 */
export type RawOutstationCard = Partial<
  Omit<OutstationCard, 'vehicleTypeId' | 'vehicleTypeName'>
> & {
  _id?: string;
  rideStatus?: OutstationRideStatus;
  /** Present on the `outstation:request` payload; the app ignores it. */
  rideType?: string;
  vehicleTypeId?: string | { _id?: string; name?: string };
  distanceFromDriverMeters?: number;
};

/**
 * The one door every trip card comes through. Returns `null` for anything with
 * no id, which is the only shape that can't be rendered.
 *
 * Keys the source didn't carry are **removed, not left `undefined`**: cards are
 * merged on update, and the short `outstation:fare_updated` payload (`rideId`,
 * `offeredFare`, `bidBounds`) would otherwise blank out the addresses, the
 * route and — worse on this product — the departure time it is meant to patch.
 */
export function toOutstationCard(
  raw?: RawOutstationCard | null,
): OutstationCard | null {
  const rideId = raw?.rideId ?? raw?._id;
  if (!raw || !rideId) {
    return null;
  }

  const fields: Partial<OutstationCard> = {
    pickupLocationName: raw.pickupLocationName,
    dropLocationName: raw.dropLocationName,
    pickupCoordinates: raw.pickupCoordinates,
    dropCoordinates: raw.dropCoordinates,
    vehicleTypeId:
      typeof raw.vehicleTypeId === 'string'
        ? raw.vehicleTypeId
        : raw.vehicleTypeId?._id,
    vehicleTypeName:
      typeof raw.vehicleTypeId === 'object'
        ? raw.vehicleTypeId?.name
        : undefined,
    estimatedDistanceKm: raw.estimatedDistanceKm,
    estimatedDurationMin: raw.estimatedDurationMin,
    suggestedFare: raw.suggestedFare,
    offeredFare: raw.offeredFare,
    bidBounds: raw.bidBounds,
    pickupAt: raw.pickupAt,
    bookingType: raw.bookingType,
    expiresAt: raw.expiresAt,
    distanceFromDriverKm: raw.distanceFromDriverKm,
  };

  const card = { rideId } as OutstationCard;
  Object.entries(fields).forEach(([key, value]) => {
    // `null` counts as absent — see `toRideCard` for why.
    if (value !== undefined && value !== null) {
      (card as Record<string, unknown>)[key] = value;
    }
  });
  return card;
}

/**
 * The statuses in which the driver is committed to a trip and it owns the
 * screen. `searching` never reaches a driver.
 */
export function isLiveOutstationStatus(
  status?: OutstationRideStatus,
): boolean {
  return (
    status === 'assigned' || status === 'arriving' || status === 'in_progress'
  );
}

/**
 * Which leg the driver is driving to. `assigned` has no leg yet — the trip may
 * be days away — but the pickup is the one that comes next either way.
 */
export function outstationPhase(
  status?: OutstationRideStatus,
): OutstationPhase {
  return status === 'in_progress' ? 'drop' : 'pickup';
}

/**
 * Whether the rider can see this driver move. **Only** `arriving` — see rule 3
 * in the doc: a trip accepted three days early must not broadcast a position
 * for three days, and once the rider is aboard there is nobody left to watch.
 */
export function isTracking(status?: OutstationRideStatus): boolean {
  return status === 'arriving';
}
