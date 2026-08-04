import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '../services/api';
import { driverSocket } from '../services/driverSocket';
import {
  fetchAvailableOutstationRides,
  fetchOutstationLiveState,
  placeOutstationBid,
  withdrawOutstationBid,
  type OutstationBidError,
} from '../services/outstationService';
import {
  outstationBidRideId,
  outstationPhase,
  toOutstationCard,
  type BookingType,
  type BusyReason,
  type OutstationCard,
  type OutstationPhase,
  type OutstationRide,
  type OutstationRideStatus,
  type RawOutstationCard,
} from '../types/outstation';
import type { LatLng } from '../types/quickRide';

/**
 * Everything the Outstation home tab needs — see `docs/driver-outstation-ride.md`.
 *
 * Shaped like `useQuickRide` on purpose, but three rules make it behave
 * differently in ways that are worth naming up front:
 *
 * 1. **Browsing is first class.** `GET /available` is not a fallback for a dead
 *    socket. A trip departing next Friday is dispatched at a moment this driver
 *    may not have been online for, so it will *never* be pushed to them — the
 *    list is the only way they see it. Hence the `bookingType` filter and the
 *    explicit refetch, neither of which QuickRide has.
 * 2. **Bids never expire**, so there is no countdown, no `expired` state, and
 *    no reason to hold only one at a time. The driver may bid on as many trips
 *    as they like; winning one deletes the rest server-side.
 * 3. **A live trip is not the same as being busy.** A trip accepted for next
 *    week leaves the driver free to work all week — the block only closes two
 *    hours before departure. So `liveRide` does not imply `busy` here.
 *
 * The duty **switch** is not owned here — `useDuty` owns it for both tabs, so
 * there is exactly one duty state and the tab renders it. What this hook does
 * own is keeping duty *pinned* while a trip is `arriving`, because that is the
 * only window a rider can watch this driver and the hook, unlike the trip
 * screen, is alive for as long as the app is.
 */

/** A bid the driver is holding on a trip. No expiry — see rule 2. */
export type OutstationPendingBid = {
  bidId: string;
  fare: number;
};

/** The trip the driver is committed to, if any. */
export type LiveOutstationRide = {
  rideId: string;
  rideStatus: OutstationRideStatus;
  phase: OutstationPhase;
  ride: OutstationRide | null;
};

/** The filter above the browse list. `all` sends no `bookingType` at all. */
export type DepartureFilter = 'all' | BookingType;

export type OutstationState = {
  loading: boolean;
  refreshing: boolean;
  /** Open trip offers, soonest departure first. */
  cards: OutstationCard[];
  /** Keyed by `rideId`. Any number of these may be live at once. */
  bids: Record<string, OutstationPendingBid>;
  liveRide: LiveOutstationRide | null;
  /** The driver cannot take outstation work right now. */
  busy: boolean;
  /** Why — so the tab can say it rather than showing an unexplained gap. */
  busyReason: BusyReason | null;
  /** The server's own sentence for `busyReason`, when it sent one. */
  busyMessage: string | null;
  needsVehicle: boolean;
  /** No coordinates yet, so the browse list can't be built. */
  needsLocation: boolean;
  departure: DepartureFilter;
  error: string | null;

  refresh: () => Promise<void>;
  setDeparture: (next: DepartureFilter) => void;
  bid: (rideId: string, fare: number) => Promise<void>;
  withdraw: (rideId: string) => Promise<void>;
  /** Called by a card when its own offer window runs out. */
  dropCard: (rideId: string) => void;
};

type Params = {
  token: string | null;
  location: LatLng | null;
  /**
   * Fires on `outstation:bid_accepted` and on resuming into a trip — go to the
   * details. `ride` is the copy the event carried, good enough for a first
   * paint.
   */
  onRideAssigned: (rideId: string, ride?: OutstationRide | null) => void;
  /** Prompts for GPS and returns a fix; used before a forced `driver:online`. */
  requestLocation: () => Promise<LatLng | null>;
  startWatching: () => void;
  stopWatching: () => void;
};

/** Identifies this hook's claim on duty in `driverSocket`. */
const DUTY_HOLD = 'outstation-trip';

export function useOutstation({
  token,
  location,
  onRideAssigned,
  requestLocation,
  startWatching,
  stopWatching,
}: Params): OutstationState {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardsById, setCardsById] = useState<Record<string, OutstationCard>>({});
  const [bids, setBids] = useState<Record<string, OutstationPendingBid>>({});
  const [liveRide, setLiveRide] = useState<LiveOutstationRide | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyReason, setBusyReason] = useState<BusyReason | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [needsVehicle, setNeedsVehicle] = useState(false);
  const [needsLocation, setNeedsLocation] = useState(false);
  const [departure, setDeparture] = useState<DepartureFilter>('all');
  const [error, setError] = useState<string | null>(null);

  // Read inside socket handlers, which are registered once and would otherwise
  // close over the first render's values.
  const assignedRef = useRef(onRideAssigned);
  assignedRef.current = onRideAssigned;
  const locationRef = useRef(location);
  locationRef.current = location;

  /* ---------------------------------------------- card mutations */

  // Takes either shape — socket card or raw trip document — because `/live`,
  // `/available` and `outstation:request` describe the same trip with different
  // key names.
  const upsertCard = useCallback((raw: RawOutstationCard) => {
    const card = toOutstationCard(raw);
    if (!card) {
      return;
    }
    setCardsById(previous => ({
      ...previous,
      // Merge rather than replace: the short `outstation:fare_updated` payload
      // carries only the fare and the bounds, and would blank the departure.
      [card.rideId]: { ...previous[card.rideId], ...card },
    }));
  }, []);

  const dropCard = useCallback((rideId: string) => {
    setCardsById(previous => {
      if (!previous[rideId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[rideId];
      return next;
    });
    setBids(previous => {
      if (!previous[rideId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[rideId];
      return next;
    });
  }, []);

  /* ---------------------------------------------- resume */

  /**
   * `GET /outstation-rides/live` rebuilds the screen: the committed trip, the
   * standing bids, and the trips on offer.
   *
   * When a `bookingType` filter is on, `/available` runs as well — `/live` has
   * no filter parameter, so the filtered list has to come from the endpoint
   * that does. Both return the same raw documents, so they merge cleanly.
   */
  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!token) {
        setLoading(false);
        return;
      }
      if (mode === 'refresh') {
        setRefreshing(true);
      }

      try {
        const at = locationRef.current;
        const live = await fetchOutstationLiveState(token, at);

        setBusy(live.busy);
        setBusyReason(live.busyReason ?? null);
        setBusyMessage(live.busyMessage ?? null);
        setNeedsVehicle(live.needsVehicle === true);
        setNeedsLocation(live.needsLocation === true || !at);
        setError(null);

        if (live.hasLiveRide && live.ride) {
          const status = live.rideStatus ?? live.ride.rideStatus;
          setLiveRide({
            rideId: live.ride._id,
            rideStatus: status,
            phase: live.navigateTo ?? outstationPhase(status),
            ride: live.ride,
          });
        } else {
          setLiveRide(null);
        }

        // A committed trip stops new offers, but standing bids survive it only
        // until it is accepted — and by then the server has deleted them. So
        // the lists are rebuilt either way and simply come back empty.
        const raw =
          departure === 'all' || !at
            ? live.availableRides
            : (await fetchAvailableOutstationRides(token, at, departure)).rides;

        const next: Record<string, OutstationCard> = {};
        raw.forEach(entry => {
          const card = toOutstationCard(entry);
          if (card) {
            next[card.rideId] = card;
          }
        });

        // Restoring the standing bids is what stops a driver who reopened the
        // app from bidding twice on the same trip.
        const restored: Record<string, OutstationPendingBid> = {};
        live.bids.forEach(entry => {
          const rideId = outstationBidRideId(entry);
          if (!rideId) {
            return;
          }
          restored[rideId] = { bidId: entry._id, fare: entry.fare };

          // A bid outlives its trip's presence in `availableRides` — under a
          // `bookingType` filter, and whenever the driver drifts out of the
          // 20 km radius. The populated trip on the bid is what keeps the card
          // on screen, so the driver can always find and withdraw it.
          if (!next[rideId] && typeof entry.outstationRideId === 'object') {
            const card = toOutstationCard(entry.outstationRideId);
            if (card) {
              next[rideId] = card;
            }
          }
        });

        setCardsById(next);
        setBids(restored);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load outstation trips',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [departure, token],
  );

  const refresh = useCallback(() => load('refresh'), [load]);

  // Resume on mount, whenever the filter changes, and again every time the app
  // comes forward. A scheduled trip list goes stale by simply sitting there.
  useEffect(() => {
    load('initial');

    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        load('refresh');
      }
    });
    return () => subscription.remove();
  }, [load]);

  /**
   * The browse list needs coordinates and the first load usually runs without
   * them — this tab never prompts on mount. So the moment a fix finally lands,
   * whether from the driver granting permission here or from QuickRide's
   * watcher starting, ask again for the list that came back empty for want of
   * one. Once only: after that the ordinary refresh paths carry it.
   */
  const hadLocation = useRef(location !== null);
  useEffect(() => {
    if (location && !hadLocation.current) {
      hadLocation.current = true;
      load('refresh');
    }
  }, [load, location]);

  /* ---------------------------------------------- socket */

  useEffect(() => {
    if (!token) {
      return;
    }
    // Connecting is `useQuickRide`'s job — it owns duty and the location ping.
    // This hook only subscribes, and calling `connect` with the same token is a
    // no-op anyway, so the ordering of the two tabs mounting doesn't matter.
    driverSocket.connect(token);

    const off = [
      driverSocket.on('outstation:request', upsertCard),

      driverSocket.on('outstation:fare_updated', payload =>
        upsertCard(payload as RawOutstationCard),
      ),

      driverSocket.on('outstation:ride_cancelled', ({ rideId }) =>
        dropCard(rideId),
      ),
      driverSocket.on('outstation:ride_expired', ({ rideId }) =>
        dropCard(rideId),
      ),
      // Another driver won. Quiet removal — this is not an error.
      driverSocket.on('outstation:ride_taken', ({ rideId }) =>
        dropCard(rideId),
      ),

      // The rider dismissed the bid. The trip itself may still be open, so only
      // the bid goes, leaving the driver free to bid again.
      driverSocket.on('outstation:bid_removed', ({ outstationRideId }) =>
        setBids(previous => {
          if (!previous[outstationRideId]) {
            return previous;
          }
          const next = { ...previous };
          delete next[outstationRideId];
          return next;
        }),
      ),

      driverSocket.on('outstation:bid_accepted', ({ rideId, ride }) => {
        // One accepted trip at a time: every other bid this driver held has
        // already been deleted server-side, so clearing them all is the truth.
        setBids({});
        setCardsById({});
        assignedRef.current(rideId, ride);
      }),

      // Shared with QuickRide, so the type has to be checked before claiming it.
      driverSocket.on('ride:rejoined', payload => {
        if (payload.rideType !== 'outstation') {
          return;
        }
        assignedRef.current(payload.rideId);
      }),

      // Completing frees the driver for both products.
      driverSocket.on('outstation:completed', () => {
        setBusy(false);
        setBusyReason(null);
        setLiveRide(null);
      }),
    ];

    return () => off.forEach(unsubscribe => unsubscribe());
  }, [dropCard, token, upsertCard]);

  /* ---------------------------------------------- tracking */

  /**
   * `arriving` is the only status a rider can watch, and the only thing feeding
   * them is the on-duty 5s location ping.
   *
   * This lives in the hook rather than on the trip screen because the screen
   * can be backed out of. A driver who set off, then popped back to the tab to
   * look at something, must not silently freeze the map of the rider — and the
   * share link they may have sent to family — for the rest of the drive. It
   * also covers the cold-start case, where the app relaunches straight into an
   * `arriving` trip with `isOnDuty` false.
   *
   * The status is refreshed by `/live` on focus and on foreground, so backing
   * out of the screen is itself what hands the hold over to this effect.
   */
  const tracking = liveRide?.rideStatus === 'arriving';

  useEffect(() => {
    if (!tracking) {
      driverSocket.releaseDuty(DUTY_HOLD);
      return;
    }
    driverSocket.holdDuty(DUTY_HOLD);
    startWatching();

    let cancelled = false;
    (async () => {
      if (driverSocket.isOnDuty) {
        return;
      }
      const fix = await requestLocation();
      if (!cancelled) {
        await driverSocket.goOnline(
          fix ? { latitude: fix.lat, longitude: fix.lng } : null,
        );
      }
    })();

    return () => {
      cancelled = true;
      // Releasing only re-enables the Go offline button; the ping itself keeps
      // running off `wantsOnline`, so a moment between holds costs nothing.
      driverSocket.releaseDuty(DUTY_HOLD);
      stopWatching();
    };
  }, [requestLocation, startWatching, stopWatching, tracking]);

  /* ---------------------------------------------- bidding */

  const bid = useCallback(
    async (rideId: string, fare: number) => {
      if (!token) {
        return;
      }
      try {
        const placed = await placeOutstationBid(token, rideId, fare);
        setBids(previous => ({
          ...previous,
          [rideId]: { bidId: placed._id, fare: placed.fare },
        }));
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        const bidError = err as OutstationBidError;

        if (status === 404) {
          dropCard(rideId);
        } else if (status === 409) {
          // A `reason` means *the driver* is blocked, not the trip — the card
          // is still perfectly valid and must stay. Anything else means this
          // trip stopped accepting bids, so it goes.
          if (bidError.reason) {
            setBusy(true);
            setBusyReason(bidError.reason);
            setBusyMessage(err instanceof Error ? err.message : null);
          } else if (/vehicle/i.test(err instanceof Error ? err.message : '')) {
            setNeedsVehicle(true);
          } else {
            dropCard(rideId);
          }
        } else if (status === 400) {
          // The bounds or the standing bid came back with the error; fold them
          // into the card so the sheet re-renders against the real limits.
          if (bidError.bidBounds) {
            upsertCard({ rideId, bidBounds: bidError.bidBounds });
          }
          if (typeof bidError.currentBid === 'number') {
            setBids(previous => ({
              ...previous,
              [rideId]: {
                ...(previous[rideId] ?? { bidId: '' }),
                fare: bidError.currentBid!,
              },
            }));
          }
        }
        throw err;
      }
    },
    [dropCard, token, upsertCard],
  );

  const withdraw = useCallback(
    async (rideId: string) => {
      const existing = bids[rideId];
      if (!token || !existing?.bidId) {
        return;
      }
      try {
        await withdrawOutstationBid(token, existing.bidId);
      } catch (err) {
        // Already swept — the outcome the driver wanted, so let it stand.
        if (!(err instanceof ApiError && err.status === 404)) {
          throw err;
        }
      }
      setBids(previous => {
        const next = { ...previous };
        delete next[rideId];
        return next;
      });
    },
    [bids, token],
  );

  /* ---------------------------------------------- derived */

  /**
   * Soonest departure first — the order the API promises and the only one that
   * makes sense here. A trip leaving in an hour and one leaving in three weeks
   * are the same distance away; the difference is when the driver has to decide.
   * Trips with no `pickupAt` sink to the bottom rather than pretending to be now.
   */
  const cards = useMemo(
    () =>
      Object.values(cardsById).sort((a, b) => {
        const left = a.pickupAt ? Date.parse(a.pickupAt) : Number.NaN;
        const right = b.pickupAt ? Date.parse(b.pickupAt) : Number.NaN;
        if (Number.isNaN(left) && Number.isNaN(right)) {
          return 0;
        }
        if (Number.isNaN(left)) {
          return 1;
        }
        if (Number.isNaN(right)) {
          return -1;
        }
        return left - right;
      }),
    [cardsById],
  );

  /**
   * A trip that is **under way** owns the screen, the same way a QuickRide does.
   *
   * `assigned` deliberately does not: it can sit there for thirty days, and the
   * driver is expected to keep taking QuickRides for most of that. Opening the
   * trip screen on every app launch until Friday would be a trap, so an
   * `assigned` trip gets a banner on the tab and waits to be tapped.
   */
  useEffect(() => {
    const status = liveRide?.rideStatus;
    if (liveRide && (status === 'arriving' || status === 'in_progress')) {
      assignedRef.current(liveRide.rideId, liveRide.ride);
    }
  }, [liveRide]);

  return {
    loading,
    refreshing,
    cards,
    bids,
    liveRide,
    busy,
    busyReason,
    busyMessage,
    needsVehicle,
    needsLocation,
    departure,
    error,
    refresh,
    setDeparture,
    bid,
    withdraw,
    dropCard,
  };
}
