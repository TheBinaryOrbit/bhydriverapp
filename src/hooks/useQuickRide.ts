import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useDuty, type DutyBlock, type GoOnlineOptions } from './useDuty';
import { ApiError } from '../services/api';
import { driverSocket, type LinkStatus } from '../services/driverSocket';
import {
  fetchLiveState,
  placeBid,
  withdrawBid,
  type BidError,
} from '../services/quickRideService';
import {
  bidRideId,
  toRideCard,
  type QuickRide,
  type RawRideCard,
  type RideCard,
  type RidePhase,
  type RideStatus,
} from '../types/quickRide';

/**
 * Everything the QuickRide home tab needs, in one place — see
 * `docs/driver-quick-ride.md`.
 *
 * The shape of the flow is: resume with `GET /quick-rides/live`, connect the
 * socket, then let events mutate the card list. REST is the source of truth on
 * open; the socket is the source of truth from then on.
 */

/** A bid the driver is currently holding on a card. */
export type PendingBid = {
  bidId: string;
  fare: number;
  expiresAt?: string;
  /** `expired` keeps the card visible but greyed rather than yanking it away. */
  status: 'pending' | 'expired';
};

/** The ride the driver is actually on, if any. */
export type LiveRide = {
  rideId: string;
  rideStatus: RideStatus;
  phase: RidePhase;
  ride: QuickRide | null;
};

/** Duty itself lives in `useDuty` — both home tabs show the same switch. */
export type { DutyBlock };

export type QuickRideState = {
  loading: boolean;
  refreshing: boolean;
  link: LinkStatus;
  onDuty: boolean;
  /** True while `driver:online` is in flight. */
  switching: boolean;
  dutyBlock: DutyBlock | null;
  /** Open ride cards, nearest pickup first. */
  cards: RideCard[];
  /** Keyed by `rideId`. */
  bids: Record<string, PendingBid>;
  liveRide: LiveRide | null;
  /** The driver is mid-ride, so no cards are coming. */
  busy: boolean;
  /**
   * Why. Not always a QuickRide: an outstation trip departing within two hours
   * blocks this product too, and an empty list with no explanation reads as a
   * dead app rather than a rule.
   */
  busyReason: string | null;
  /** The server's own sentence for `busyReason`, when it sent one. */
  busyMessage: string | null;
  /**
   * Duty is held on by an active ride and `goOffline` will not act. The rider
   * is tracking this driver, so the location ping has to keep running.
   */
  dutyLocked: boolean;
  /**
   * On duty, but the foreground service would not start — so this shift only
   * lasts while the app is on screen. A warning, not a block.
   */
  backgroundUnavailable: boolean;
  /** The background-permissions sheet is open — `driver:online` waits on it. */
  permissionGate: boolean;
  needsVehicle: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  goOnline: (options?: GoOnlineOptions) => Promise<void>;
  goOffline: () => void;
  bid: (rideId: string, fare: number) => Promise<void>;
  withdraw: (rideId: string) => Promise<void>;
  /** Called by a card when its own countdown runs out. */
  dropCard: (rideId: string) => void;
  clearDutyBlock: () => void;
  clearBackgroundWarning: () => void;
  dismissPermissionGate: () => void;
  continueAfterPermissions: () => Promise<void>;
};

type Params = {
  token: string | null;
  location: { lat: number; lng: number } | null;
  /**
   * Fires on `bid:accepted` and on resuming into a ride — go to the details.
   * `ride` is the copy the event carried, good enough for a first paint.
   */
  onRideAssigned: (rideId: string, ride?: QuickRide | null) => void;
  /** Prompts for GPS and returns a fix; used right before `driver:online`. */
  requestLocation: () => Promise<{ lat: number; lng: number } | null>;
  startWatching: () => void;
};

/** Identifies this product's claim on duty in `driverSocket`. */
const DUTY_HOLD = 'quickride';

export function useQuickRide({
  token,
  location,
  onRideAssigned,
  requestLocation,
  startWatching,
}: Params): QuickRideState {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardsById, setCardsById] = useState<Record<string, RideCard>>({});
  const [bids, setBids] = useState<Record<string, PendingBid>>({});
  const [liveRide, setLiveRide] = useState<LiveRide | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyReason, setBusyReason] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [needsVehicle, setNeedsVehicle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside socket handlers, which are registered once and would otherwise
  // close over the first render's values.
  const assignedRef = useRef(onRideAssigned);
  assignedRef.current = onRideAssigned;
  const locationRef = useRef(location);
  locationRef.current = location;

  /* ---------------------------------------------- card mutations */

  // Takes either shape — socket card or raw ride document — because `/live`
  // and `ride:request` describe the same ride with different key names.
  const upsertCard = useCallback((raw: RawRideCard) => {
    const card = toRideCard(raw);
    if (!card) {
      return;
    }
    setCardsById(previous => ({
      ...previous,
      // Merge rather than replace: the short `ride:fare_updated` payload only
      // carries the fare and the bounds, and would blank the rest.
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
   * `GET /quick-rides/live` — one call that rebuilds the whole screen: the
   * active ride and its phase, the still-running bids, and the nearby cards.
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
        const live = await fetchLiveState(token, locationRef.current);
        setBusy(live.busy);
        setBusyReason(live.busyReason ?? null);
        setBusyMessage(live.busyMessage ?? null);
        setNeedsVehicle(live.needsVehicle === true);
        setError(null);

        if (live.hasLiveRide && live.ride) {
          const status = live.rideStatus ?? live.ride.rideStatus;
          setLiveRide({
            rideId: live.ride._id,
            rideStatus: status,
            // `navigateTo` is computed server-side; only fall back if it's absent.
            phase:
              live.navigateTo ?? (status === 'in_progress' ? 'drop' : 'pickup'),
            ride: live.ride,
          });
          // Mid-ride there are no cards and no bids by definition.
          setCardsById({});
          setBids({});
        } else {
          setLiveRide(null);

          // `/live` sends the stored documents, keyed `_id`; the socket sends
          // cards keyed `rideId`. Both end up here as the same card, so a
          // fetched ride renders exactly like one that arrived live.
          const next: Record<string, RideCard> = {};
          live.availableRides.forEach(raw => {
            const card = toRideCard(raw);
            if (card) {
              next[card.rideId] = card;
            }
          });

          // Restoring the pending bids is what stops a driver who reopened the
          // app from bidding twice on the same ride.
          const restored: Record<string, PendingBid> = {};
          live.bids.forEach(bid => {
            const rideId = bidRideId(bid);
            if (!rideId) {
              return;
            }
            restored[rideId] = {
              bidId: bid._id,
              fare: bid.fare,
              expiresAt: bid.expiresAt,
              status: 'pending',
            };
            // A bid can outlive its card's presence in `availableRides` — the
            // populated ride on the bid is what keeps the card on screen.
            if (!next[rideId] && typeof bid.quickRideId === 'object') {
              const card = toRideCard(bid.quickRideId);
              if (card) {
                next[rideId] = card;
              }
            }
          });

          setCardsById(next);
          setBids(restored);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load your rides',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  const refresh = useCallback(() => load('refresh'), [load]);

  // Resume on mount, and again whenever the app returns from the background —
  // the doc's rule is one `/live` call every time the app comes forward.
  useEffect(() => {
    load('initial');

    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        load('refresh');
      }
    });
    return () => subscription.remove();
  }, [load]);

  // A live ride owns the screen; hand it to the details screen right away.
  useEffect(() => {
    if (liveRide) {
      assignedRef.current(liveRide.rideId, liveRide.ride);
    }
  }, [liveRide]);

  /* ---------------------------------------------- socket */

  useEffect(() => {
    if (!token) {
      return;
    }
    driverSocket.connect(token);

    const off = [
      // The list only. Drawing this over another app belongs to
      // `services/rideDispatch`, which outlives this hook — a request that
      // arrives after the driver has swiped the app away has no React tree left
      // to reach, and that is the case the overlay exists for.
      driverSocket.on('ride:request', raw => upsertCard(raw)),

      // Arrives in two shapes — the full card when you're re-dispatched, the
      // short `{ rideId, offeredFare, bidBounds }` when you already hold a bid.
      driverSocket.on('ride:fare_updated', payload =>
        upsertCard(payload as RideCard),
      ),

      driverSocket.on('ride:cancelled', ({ rideId }) => dropCard(rideId)),
      driverSocket.on('ride:expired', ({ rideId }) => dropCard(rideId)),
      // Another driver won. Quiet removal — this is not an error.
      driverSocket.on('ride:taken', ({ rideId }) => dropCard(rideId)),

      driverSocket.on('bid:expired', ({ quickRideId }) =>
        setBids(previous =>
          previous[quickRideId]
            ? {
                ...previous,
                [quickRideId]: { ...previous[quickRideId], status: 'expired' },
              }
            : previous,
        ),
      ),
      // The rider dismissed the bid — the ride itself may still be open, so
      // only the bid goes, leaving the driver free to bid again.
      driverSocket.on('bid:removed', ({ quickRideId }) =>
        setBids(previous => {
          if (!previous[quickRideId]) {
            return previous;
          }
          const next = { ...previous };
          delete next[quickRideId];
          return next;
        }),
      ),

      driverSocket.on('bid:accepted', ({ rideId, ride }) => {
        setBusy(true);
        setCardsById({});
        setBids({});
        assignedRef.current(rideId, ride);
      }),

      // Reconnected straight into an active ride. Shared with outstation, and
      // a driver can hold one of each at once — so an outstation rejoin must
      // not be dragged onto the QuickRide details screen.
      driverSocket.on('ride:rejoined', payload => {
        if (payload.rideType === 'outstation') {
          return;
        }
        setBusy(true);
        assignedRef.current(payload.rideId);
      }),

      // Completing frees the driver, so the home tab goes back to listening.
      driverSocket.on('ride:completed', () => {
        setBusy(false);
        setBusyReason(null);
        setLiveRide(null);
      }),
    ];

    return () => off.forEach(unsubscribe => unsubscribe());
    // The socket outlives this screen on purpose — unmounting only drops the
    // listeners, never the connection.
  }, [token, upsertCard, dropCard]);

  /* ---------------------------------------------- duty */

  /**
   * `busy` and `liveRide` are set from separate fields on the same `/live`
   * response, and `ride:rejoined` / `bid:accepted` raise only `busy`. Either
   * one alone means there is a rider depending on this driver's position.
   */
  const onRide = busy || liveRide !== null;

  const {
    link,
    onDuty,
    switching,
    dutyBlock,
    dutyLocked,
    backgroundUnavailable,
    permissionGate,
    goOnline,
    goOffline,
    clearDutyBlock,
    clearBackgroundWarning,
    dismissPermissionGate,
    continueAfterPermissions,
  } = useDuty({
    requestLocation,
    startWatching,
    locked: onRide,
    // The cards that were open before going online are stale by now.
    onWentOnline: refresh,
    onWentOffline: useCallback(() => {
      setCardsById({});
      setBids({});
    }, []),
  });

  /**
   * A rider is watching this driver move, so duty is pinned for as long as the
   * ride runs. Registered on the socket rather than kept local, because the
   * outstation tab has to be locked out of `goOffline` by this too.
   */
  useEffect(() => {
    if (!onRide) {
      driverSocket.releaseDuty(DUTY_HOLD);
      return;
    }
    driverSocket.holdDuty(DUTY_HOLD);
    return () => driverSocket.releaseDuty(DUTY_HOLD);
  }, [onRide]);

  /**
   * A ride in progress owns the driver's duty state.
   *
   * The rider's live map is fed by the same 5s `driver:location` ping that
   * makes a free driver discoverable, and that ping only runs while on duty.
   * Nothing else re-arms it: a fresh process starts with
   * `driverSocket.isOnDuty === false`, and both of the mid-ride resume paths
   * (`/live` reporting `busy`, and `ride:rejoined`) only set `busy` and hand
   * off to the details screen. So a driver who force-quit the app, or who was
   * simply cold-started onto a ride, would go on driving while the rider
   * watched a car frozen where it was minutes ago.
   */
  const resumedForRide = useRef(false);

  useEffect(() => {
    if (!onRide) {
      resumedForRide.current = false;
      return;
    }
    if (onDuty || switching || resumedForRide.current) {
      return;
    }
    // Once per ride — a `goOnline` that fails leaves its own `dutyBlock` with a
    // retry rather than looping on a driver who has no signal.
    resumedForRide.current = true;
    // No permission sheet on this path. The driver is already on a ride, this
    // tab is sitting behind the details screen, and a modal raised from here
    // would either be invisible or interrupt a trip in progress to ask a
    // question that cannot stop the ping from being owed to the rider anyway.
    goOnline({ prompt: false });
  }, [goOnline, onDuty, onRide, switching]);

  /* ---------------------------------------------- bidding */

  const bid = useCallback(
    async (rideId: string, fare: number) => {
      if (!token) {
        return;
      }
      try {
        const placed = await placeBid(token, rideId, fare);
        setBids(previous => ({
          ...previous,
          [rideId]: {
            bidId: placed._id,
            fare: placed.fare,
            expiresAt: placed.expiresAt,
            status: 'pending',
          },
        }));
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;

        // 404 and most 409s mean the card is dead — drop it rather than leaving
        // the driver tapping a ride nobody can win.
        if (status === 404) {
          dropCard(rideId);
        } else if (status === 409) {
          const message = err instanceof Error ? err.message : '';
          if (/active ride/i.test(message)) {
            setBusy(true);
          } else if (!/vehicle/i.test(message)) {
            dropCard(rideId);
          }
        } else if (status === 400) {
          // The bounds or the standing bid came back with the error; fold them
          // into the card so the slider re-renders against the real limits.
          const bidError = err as BidError;
          if (bidError.bidBounds) {
            upsertCard({ rideId, bidBounds: bidError.bidBounds });
          }
          if (typeof bidError.currentBid === 'number') {
            setBids(previous => ({
              ...previous,
              [rideId]: {
                ...(previous[rideId] ?? {
                  bidId: '',
                  status: 'pending' as const,
                }),
                fare: bidError.currentBid!,
                status: 'pending',
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
        await withdrawBid(token, existing.bidId);
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

  const cards = useMemo(
    () =>
      Object.values(cardsById).sort(
        (a, b) =>
          (a.distanceFromDriverKm ?? Number.MAX_SAFE_INTEGER) -
          (b.distanceFromDriverKm ?? Number.MAX_SAFE_INTEGER),
      ),
    [cardsById],
  );

  return {
    loading,
    refreshing,
    link,
    onDuty,
    switching,
    dutyBlock,
    cards,
    bids,
    liveRide,
    busy,
    busyReason,
    busyMessage,
    dutyLocked,
    backgroundUnavailable,
    permissionGate,
    needsVehicle,
    error,
    refresh,
    goOnline,
    goOffline,
    bid,
    withdraw,
    dropCard,
    clearDutyBlock,
    clearBackgroundWarning,
    dismissPermissionGate,
    continueAfterPermissions,
  };
}
