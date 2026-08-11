import { AppState } from 'react-native';

import { driverSocket } from './driverSocket';
import { placeOutstationBid } from './outstationService';
import { placeBid } from './quickRideService';
import {
  hideRideOverlay,
  isRideOverlayShowing,
  onRideOverlayAction,
  openApp,
  showOutstationOverlay,
  showRideOverlay,
} from './rideOverlay';
import { getToken } from '../storage/authStorage';
import {
  toOutstationCard,
  type OutstationCard,
  type RawOutstationCard,
} from '../types/outstation';
import { toRideCard, type RawRideCard, type RideCard } from '../types/quickRide';

/**
 * Ride requests, answered with no screen on.
 *
 * The overlay used to be driven from `useQuickRide`, which is a hook inside a
 * tab — so the wiring existed exactly as long as the React tree did. That is the
 * wrong lifetime by one whole case: swiping the app out of recents destroys the
 * activity and unmounts the tree, the duty service keeps the process, the socket
 * and the timers alive, and the next `ride:request` arrived with nobody left
 * listening for it. The card never appeared in the one situation it was built
 * for.
 *
 * So the ownership moves here — a module, started from `index.js`, with no
 * lifetime shorter than the JS context itself. It runs identically in all three
 * contexts the app has: the normal one with the UI up, the headless one
 * `DutyService` starts for a shift with no activity, and the headless one
 * Firebase starts for a data push into a process that had been killed outright.
 *
 * **Both products dispatch through here.** An outstation trip reaches a driver
 * on exactly the same terms — pushed over the socket while they are in another
 * app — and the reason the card exists is the driver's attention, not the
 * product's urgency. What the two do not share is where a bid is *sent*, so the
 * offer cache remembers which one each ride came from and the swipe is routed by
 * that rather than by guessing from the id.
 *
 * It deliberately owns very little — the offer per open ride, and which ride is
 * currently drawn. Everything else still belongs to `useQuickRide` and
 * `useOutstation`, which keep their own cards for the lists they render; all
 * three read the same socket and never write to each other.
 */

/** Registered once per JS context. */
let started = false;

/**
 * An open offer, and which product's bid endpoint answers it. The fare is
 * cached for the one case the card cannot supply it — a trip with no usable bid
 * range, where the slider was never drawn.
 */
type Offer =
  | { type: 'quickRide'; card: RideCard }
  | { type: 'outstation'; card: OutstationCard };

/**
 * The rides currently open to this driver, by id. Small and self-pruning: rides
 * leave on the same events that take the card off screen.
 */
const offers = new Map<string, Offer>();

/** The ride the overlay is drawn for, or `null` when nothing is up. */
let showingRideId: string | null = null;

/**
 * Set only on the push path — see [offerPushedRide]. A headless task started by
 * Firebase lives exactly as long as its handler's promise, so something has to
 * hold that promise open while the card counts down, or the runtime is torn down
 * under a window the driver is still looking at.
 */
let awaitingCard: { rideId: string; done: () => void } | null = null;

/**
 * Wires the overlay to the socket. Idempotent, and safe to call before login —
 * it only registers listeners, and a socket that never connects never fires.
 */
export function startRideDispatch(): void {
  if (started) {
    return;
  }
  started = true;

  driverSocket.on('ride:request', raw => {
    // Not awaited: there is a shift holding this runtime open, so nothing needs
    // to be kept alive until the card resolves.
    offer(raw);
  });

  // Two shapes — the full card when the driver is re-dispatched, the short
  // `{ rideId, offeredFare }` when they already hold a bid. `toRideCard` takes
  // either. Only the fare is read: redrawing the card would restart a countdown
  // that is already running against the ride's real expiry.
  driverSocket.on('ride:fare_updated', payload => {
    const update = toRideCard(payload as RawRideCard);
    if (!update || typeof update.offeredFare !== 'number') {
      return;
    }
    const known = offers.get(update.rideId);
    if (known?.type !== 'quickRide') {
      return;
    }
    offers.set(update.rideId, {
      type: 'quickRide',
      card: { ...known.card, offeredFare: update.offeredFare },
    });
  });

  // Taken by someone else, cancelled by the rider, or timed out. All three leave
  // a window counting down on a ride no bid can win any more.
  driverSocket.on('ride:taken', ({ rideId }) => forget(rideId));
  driverSocket.on('ride:cancelled', ({ rideId }) => forget(rideId));
  driverSocket.on('ride:expired', ({ rideId }) => forget(rideId));

  // Won one. Every other card is dead at once, including any still on screen
  // over another app — a driver on a QuickRide can't take outstation work
  // either, so the whole cache goes rather than just this product's half.
  driverSocket.on('bid:accepted', () => {
    offers.clear();
    dropCard();
  });

  /* ---------------------------------------------- outstation */

  driverSocket.on('outstation:request', raw => {
    offerTrip(raw);
  });

  // Same rule as QuickRide's: the fare moves, the card does not get redrawn.
  driverSocket.on('outstation:fare_updated', payload => {
    const update = toOutstationCard(payload as RawOutstationCard);
    if (!update || typeof update.offeredFare !== 'number') {
      return;
    }
    const known = offers.get(update.rideId);
    if (known?.type !== 'outstation') {
      return;
    }
    offers.set(update.rideId, {
      type: 'outstation',
      card: { ...known.card, offeredFare: update.offeredFare },
    });
  });

  driverSocket.on('outstation:ride_taken', ({ rideId }) => forget(rideId));
  driverSocket.on('outstation:ride_cancelled', ({ rideId }) => forget(rideId));
  driverSocket.on('outstation:ride_expired', ({ rideId }) => forget(rideId));

  /**
   * The trip is theirs, and every other outstation bid they held was deleted
   * server-side — so those offers go, and the window with them if it was one.
   *
   * Only this product's, unlike `bid:accepted` above. An accepted trip can be
   * thirty days out and the driver is expected to keep taking QuickRides until
   * two hours before it; tearing down a QuickRide card they are mid-swipe on
   * would cost them a ride they are still perfectly free to take.
   */
  driverSocket.on('outstation:bid_accepted', () => {
    offers.forEach((offered, rideId) => {
      if (offered.type === 'outstation') {
        forget(rideId);
      }
    });
  });

  onRideOverlayAction(({ action, rideId, fare }) => {
    showingRideId = null;
    // The only other action is `dismiss` — the ✕ or the countdown running out,
    // both of which are already done by the time this lands.
    const work = action === 'bid' ? bid(rideId, fare) : Promise.resolve();
    work.finally(() => release(rideId));
  });

  /**
   * Coming back to the app takes the card down. The tab underneath shows the
   * same ride with the slider on it, so leaving the overlay up would cover the
   * better version of itself with the worse one.
   */
  AppState.addEventListener('change', next => {
    if (next === 'active' && isRideOverlayShowing()) {
      dropCard();
    }
  });
}

/* ------------------------------------------------ the push path */

/**
 * A ride request that arrived as a **data-only** FCM message, which is the only
 * way one reaches an app whose process is gone — force-stopped by the driver, or
 * killed by an OEM battery manager that never restarted the service. There is no
 * socket in that context and no shift running; there is a JS runtime Firebase
 * started for this one message, and about a minute of it.
 *
 * Resolves when the card is finished with — a bid placed, dismissed, or timed
 * out — because the runtime is torn down the moment it does.
 *
 * Every value in an FCM `data` payload is a string, which is all the parsing
 * below is doing. The fields, as the server sends them:
 *
 * | key                    | becomes                          |
 * | ---------------------- | -------------------------------- |
 * | `rideId`               | the card's identity — required   |
 * | `offeredFare`          | the header, and where the slider starts |
 * | `minFare` / `maxFare`  | `bidBounds` — the slider's range  |
 * | `expiresAt`            | the countdown                    |
 * | `pickup` / `drop`      | the two address lines            |
 * | `estimatedDistanceKm`  | "12 km trip"                     |
 * | `distanceFromDriverKm` | "2.4 km away"                    |
 *
 * `minFare`/`maxFare` are the interesting pair: without them the card falls back
 * to the offered fare as a single fixed price, which is the old behaviour and a
 * strictly worse card. With them the driver can undercut from a push exactly as
 * they can from the socket.
 */
export async function offerPushedRide(
  data: Record<string, string | undefined>,
): Promise<void> {
  startRideDispatch();

  const rideId = data.rideId;
  if (!rideId) {
    return;
  }

  const min = number(data.minFare);
  const max = number(data.maxFare);

  await offer(
    {
      rideId,
      pickupLocationName: data.pickup,
      dropLocationName: data.drop,
      offeredFare: number(data.offeredFare),
      // Left off entirely unless both arrived and they describe a real range —
      // `toRideCard` treats a partial one as absent anyway, and `showRideOverlay`
      // wants "no bounds" rather than a half-built pair it has to second-guess.
      bidBounds:
        min !== undefined && max !== undefined && max > min
          ? { min, max }
          : undefined,
      estimatedDistanceKm: number(data.estimatedDistanceKm),
      distanceFromDriverKm: number(data.distanceFromDriverKm),
      expiresAt: data.expiresAt ?? inSeconds(FALLBACK_WINDOW_SECONDS),
    },
    { hold: true },
  );
}

/**
 * How long a pushed card counts down for when the server did not say.
 *
 * A guess, and the wrong thing to rely on: a bid placed after the real window
 * closes is refused by the server, which leaves the driver having tapped for
 * nothing. It is here so the card appears at all on a payload that omits the
 * expiry, not as a substitute for one.
 */
const FALLBACK_WINDOW_SECONDS = 25;

/* ------------------------------------------------ internals */

/**
 * Takes a request from either source and draws it if it earns a window —
 * `showRideOverlay` owns that decision, so this forwards everything and lets it
 * choose.
 */
async function offer(
  raw: RawRideCard,
  { hold = false }: { hold?: boolean } = {},
): Promise<void> {
  const card = toRideCard(raw);
  if (!card) {
    return;
  }
  offers.set(card.rideId, { type: 'quickRide', card });

  const shown = await showRideOverlay(card);
  if (!shown) {
    return;
  }
  showingRideId = card.rideId;

  if (!hold) {
    return;
  }

  await new Promise<void>(resolve => {
    awaitingCard = { rideId: card.rideId, done: resolve };
    // The card removes itself at zero and reports a `dismiss`, so this only
    // fires if that event never lands. Better a task that ends late than a
    // runtime torn down under a window the driver is still reading.
    setTimeout(() => release(card.rideId), (secondsOn(card) + 5) * 1000);
  });
}

/**
 * The outstation half of [offer]. Same shape, different card type — and
 * `showOutstationOverlay` is the one that knows this product's card has no
 * countdown on it.
 *
 * There is no `hold` here: an outstation trip only ever arrives over the socket,
 * which means a shift is already holding this runtime open. Nothing has to be
 * kept alive by hand the way a pushed QuickRide does.
 */
async function offerTrip(raw: RawOutstationCard): Promise<void> {
  const card = toOutstationCard(raw);
  if (!card) {
    return;
  }
  offers.set(card.rideId, { type: 'outstation', card });

  if (await showOutstationOverlay(card)) {
    showingRideId = card.rideId;
  }
}

/**
 * Bids at the fare the driver swiped on, at whichever product this ride is.
 *
 * `swiped` comes off the card's own slider and is authoritative — re-deriving it
 * from `offeredFare` here would quietly discard the number the driver actually
 * chose. The cached offer is only a fallback for a card that had no usable range
 * to draw, where the slider was hidden and the offer is all there ever was.
 *
 * A ride the cache has forgotten is not bid on at all. The two endpoints take
 * the same arguments and would both accept this id, so guessing would mean
 * posting an outstation trip to `/quick-rides` — a `404` at best, and at worst a
 * bid the driver never sees again on the wrong product.
 */
async function bid(rideId: string, swiped: number): Promise<void> {
  const offered = offers.get(rideId);
  if (!offered) {
    return;
  }

  const fare = swiped > 0 ? swiped : offered.card.offeredFare;
  if (typeof fare !== 'number' || fare <= 0) {
    return;
  }
  const token = await getToken();
  if (!token) {
    return;
  }

  try {
    if (offered.type === 'outstation') {
      await placeOutstationBid(token, rideId, fare);
    } else {
      await placeBid(token, rideId, fare);
    }
  } catch (error) {
    // Swallowed on purpose. The card is gone by now and the driver is in another
    // app entirely, so there is no surface to report on; the ride stays unbid,
    // which is the same outcome as ignoring it. The app is deliberately *not*
    // opened on this path — throwing a driver out of Maps to show them nothing
    // they can act on is worse than the silence.
    if (__DEV__) {
      console.warn('[dispatch] bid from the overlay failed —', error);
    }
    return;
  }

  // An outstation bid stops here. It stands until the rider chooses — possibly
  // for days, on a trip departing next month — so there is nothing waiting in
  // the app worth pulling a driver out of their navigation for. They find it on
  // the Outstation tab whenever they next open it.
  if (offered.type === 'outstation') {
    return;
  }

  // A QuickRide bid does not: bring the driver back to the app, because they
  // have just committed money on a ride they may be assigned in seconds, and a
  // card that simply vanished is indistinguishable from one that failed. The tab
  // they land on refreshes from `/live` on the way in, so the bid is on screen
  // when they get there.
  openApp();
}

/** The ride is dead. Drop the fare and the window if it was the one showing. */
function forget(rideId: string): void {
  offers.delete(rideId);
  if (showingRideId === rideId) {
    dropCard();
  }
  release(rideId);
}

function dropCard(): void {
  const rideId = showingRideId;
  showingRideId = null;
  hideRideOverlay();
  if (rideId) {
    release(rideId);
  }
}

/** Lets a waiting headless task finish. A no-op on the socket path. */
function release(rideId: string): void {
  if (awaitingCard?.rideId !== rideId) {
    return;
  }
  const { done } = awaitingCard;
  awaitingCard = null;
  done();
}

function secondsOn(card: RideCard): number {
  const at = card.expiresAt ? new Date(card.expiresAt).getTime() : NaN;
  if (Number.isNaN(at)) {
    return FALLBACK_WINDOW_SECONDS;
  }
  return Math.max(0, Math.floor((at - Date.now()) / 1000));
}

function inSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/** `undefined` rather than `NaN` for a missing or unparseable `data` field. */
function number(value?: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
