import { AppState, Platform } from 'react-native';
import i18n from 'i18next';

import NativeRideOverlay from '../specs/NativeRideOverlay';
import type {
  RideOverlayAction,
  RideOverlayCard,
} from '../specs/NativeRideOverlay';
import { departureLabel } from '../components/outstation/format';
import { distance, rupees, summaryLine } from '../components/quickride/format';
import { colors } from '../theme/colors';
import type { OutstationCard } from '../types/outstation';
import type { BidBounds, RideCard } from '../types/quickRide';

/**
 * A ride request, put in front of a driver who is looking at something else.
 *
 * This module owns the *whether*, not just the how. Callers forward every
 * request they get and this decides whether it earns a window, so the rule lives
 * in one place instead of being re-derived on each surface:
 *
 * - The app is already in front of the driver → no. The tab's own card is
 *   better in every way, and a window on top of it would cover the thing it is
 *   duplicating.
 * - The overlay grant is missing → no. Skipping it at the duty sheet is allowed,
 *   and the request falls back to the notification.
 * - The card has already expired → no. It could only produce a bid the server
 *   rejects.
 *
 * `bid` is the whole reason it exists. Both products are bidding flows, so there
 * is no "accept" to offer — the card carries the range, the slider and the
 * slide-to-confirm, and the driver names their fare without leaving the app they
 * are actually using. Which is also why there is no "open in app" on it: the one
 * thing the app used to be needed for is on the card now, and the two remaining
 * answers are bid or ✕.
 *
 * Both products draw the same card, tagged. What differs between them is the
 * clock — see [showOutstationOverlay].
 */

const SUPPORTED = Platform.OS === 'android';

/** Below this there is no point drawing a window the driver cannot act on. */
const MIN_USEFUL_SECONDS = 3;

/** Rupee granularity of the drag and the − / + buttons, as `FareSlider` uses. */
const BID_STEP = 10;

/**
 * How long an outstation card sits over the driver's other app.
 *
 * Not an expiry — the offer runs for `createdAt + 24h` and the bid it places
 * would stand for days. It is how long a window is allowed to cover somebody
 * else's navigation for a trip that departs next week: long enough to read the
 * route and drag the slider, short enough that ignoring it costs nothing. The
 * trip is still in the Outstation tab afterwards, which is where these are
 * normally found in the first place.
 */
const OUTSTATION_CARD_SECONDS = 60;

/** How each product names and colours itself on the card. */
const TAG = {
  quickRide: { label: 'home.tabs.quickRide', color: colors.secondary },
  outstation: { label: 'home.tabs.outstation', color: colors.tertiary },
} as const;

/**
 * Shows a QuickRide request if it earns a card. Resolves `false` when it
 * doesn't — which is the normal path, not a failure.
 */
export async function showRideOverlay(card: RideCard): Promise<boolean> {
  if (!canDraw()) {
    return false;
  }

  const seconds = secondsUntil(card.expiresAt);
  if (seconds < MIN_USEFUL_SECONDS) {
    return false;
  }

  const bid = bidRange(card);
  // Nothing to commit to. A card whose swipe would place a bid of ₹0 is worse
  // than no card: the driver spends the gesture and the server refuses it.
  if (bid.start <= 0) {
    return false;
  }

  return present({
    rideId: card.rideId,
    tag: i18n.t(TAG.quickRide.label),
    tagColor: TAG.quickRide.color,
    // `—` for a missing name, matching `RouteLine` — the card is worth showing
    // for the fare and the distance even when geocoding came back empty, and a
    // blank line reads as a bug.
    pickup: card.pickupLocationName ?? '—',
    drop: card.dropLocationName ?? '—',
    fare: rupees(card.offeredFare),
    detail: summaryLine([away(card), trip(card)]),
    ...fareControls(bid),
    // The seconds are the decision here, so they are on the card.
    showCountdown: true,
    expiresInSeconds: seconds,
  });
}

/**
 * The same card for an outstation trip, with the clock taken off it.
 *
 * Everything about this product is slower: bids never expire, the offer stands
 * for a day, and the trip itself may depart in three weeks. So the card leads
 * with the **departure** rather than a countdown — that is the number the driver
 * plans around — and the pill is hidden, because a window that shows `47` on an
 * offer good until tomorrow teaches the driver to panic on the wrong ones.
 *
 * It still removes itself, on [OUTSTATION_CARD_SECONDS]. A card that could sit
 * over Maps for an hour would be the worse bug.
 */
export async function showOutstationOverlay(
  card: OutstationCard,
): Promise<boolean> {
  if (!canDraw()) {
    return false;
  }

  // A trip with no `expiresAt` is treated as open rather than as closed — unlike
  // QuickRide, where the absence of a window means the ride has none left. The
  // card's own timer is what takes it down either way.
  const offerSeconds = card.expiresAt
    ? secondsUntil(card.expiresAt)
    : OUTSTATION_CARD_SECONDS;
  if (offerSeconds < MIN_USEFUL_SECONDS) {
    return false;
  }

  const bid = bidRange(card);
  if (bid.start <= 0) {
    return false;
  }

  return present({
    rideId: card.rideId,
    tag: i18n.t(TAG.outstation.label),
    tagColor: TAG.outstation.color,
    pickup: card.pickupLocationName ?? '—',
    drop: card.dropLocationName ?? '—',
    fare: rupees(card.offeredFare),
    // The departure first: on this product "when does it leave" outranks both
    // distances, and it is the one thing a QuickRide card never has to say.
    detail: summaryLine([
      departureLabel(card.pickupAt, translate),
      away(card),
      trip(card),
    ]),
    ...fareControls(bid),
    showCountdown: false,
    // Clamped by whatever is left of the offer, so a trip in the last minute of
    // its window cannot leave a card up past it.
    expiresInSeconds: Math.min(OUTSTATION_CARD_SECONDS, offerSeconds),
  });
}

/**
 * Takes the card down for a reason that came from outside it — the ride was
 * taken by someone else, cancelled, or the driver opened the app. Every one of
 * those makes the window stale while it is still counting down.
 */
export function hideRideOverlay(): void {
  if (!SUPPORTED || !NativeRideOverlay) {
    return;
  }
  try {
    NativeRideOverlay.hide();
  } catch {
    // Nothing was up, or the window had already gone.
  }
}

export function isRideOverlayShowing(): boolean {
  if (!SUPPORTED || !NativeRideOverlay) {
    return false;
  }
  try {
    return NativeRideOverlay.isShowing();
  } catch {
    return false;
  }
}

/** Every tap on the card, plus the `dismiss` it sends when its timer runs out. */
export function onRideOverlayAction(
  listener: (event: RideOverlayAction) => void,
): () => void {
  if (!SUPPORTED || !NativeRideOverlay) {
    return () => {};
  }
  const subscription = NativeRideOverlay.onAction(listener);
  return () => subscription.remove();
}

/**
 * Brings the app forward from a context that may have no activity at all.
 *
 * Used after a bid placed from the overlay: the driver has just committed money
 * on a ride they are about to be assigned, and leaving them in Maps with a card
 * that simply vanished gives them no way to tell whether it worked. The native
 * side launches the task because JS cannot — there may be no activity to resume,
 * and `singleTask` means an existing one comes back where it was rather than
 * starting a second copy.
 */
export function openApp(): void {
  if (!SUPPORTED || !NativeRideOverlay) {
    return;
  }
  try {
    NativeRideOverlay.openApp();
  } catch (error) {
    if (__DEV__) {
      console.warn('[overlay] could not bring the app forward —', error);
    }
  }
}

/* ------------------------------------------------ internals */

/** The two conditions neither product can draw a card without. */
function canDraw(): boolean {
  if (!SUPPORTED || !NativeRideOverlay) {
    return false;
  }
  // `active` is the app on screen. Both other states — `background`, and the
  // `inactive` of a phone call or the notification shade being pulled down —
  // mean the driver cannot see the tab's card.
  return AppState.currentState !== 'active';
}

/** Hands the finished payload to the window, swallowing a refused grant. */
async function present(card: RideOverlayCard): Promise<boolean> {
  const overlay = NativeRideOverlay;
  if (!overlay) {
    return false;
  }
  try {
    return await overlay.show(card);
  } catch (error) {
    if (__DEV__) {
      console.warn('[overlay] could not draw the card —', error);
    }
    return false;
  }
}

/**
 * The stepper, the slider and the swipe — identical on both products, because
 * the bid itself is. Only the range differs, and that came from the server.
 */
function fareControls(bid: { min: number; max: number; start: number }) {
  return {
    bidMin: bid.min,
    bidMax: bid.max,
    bidStart: bid.start,
    bidStep: BID_STEP,
    currency: '₹',

    fareLabel: i18n.t('overlay.yourFare'),
    // `{fare}` is a placeholder for Kotlin, not for i18next — the amount
    // changes under the driver's thumb, so the label is re-substituted
    // natively on every move rather than re-rendered from here. Handing
    // i18next the literal string is what keeps the locale files written the
    // one way, with `{{fare}}` like every other interpolation.
    swipeLabel: i18n.t('overlay.swipeToBid', { fare: '{fare}' }),
  };
}

function away(card: RideCard | OutstationCard): string | null {
  const km = distance(card.distanceFromDriverKm);
  return km ? i18n.t('overlay.away', { distance: km }) : null;
}

function trip(card: RideCard | OutstationCard): string | null {
  const km = distance(card.estimatedDistanceKm);
  return km ? i18n.t('overlay.trip', { distance: km }) : null;
}

/** `departureLabel` takes the `t` it should use; outside React that is i18next. */
function translate(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

/**
 * The range the slider runs across, on the same rule the in-app `BidControl`
 * uses: the server's bounds when it sent usable ones, and the rider's offer as
 * a lone fixed price when it did not.
 *
 * `max <= min` is how the card is told there is no range worth drawing — it then
 * hides the slider and commits at `start`, which is what the old fixed button
 * did. There is no lowering path here: a driver holding a bid on this ride is
 * not being shown a fresh request for it, and guessing the ceiling wrong is a
 * gesture spent on a `400`.
 */
function bidRange(card: {
  offeredFare?: number;
  bidBounds?: BidBounds | null;
}): { min: number; max: number; start: number } {
  const offered = typeof card.offeredFare === 'number' ? card.offeredFare : 0;

  if (!usable(card.bidBounds)) {
    return { min: 0, max: 0, start: offered };
  }

  const { min, max } = card.bidBounds;
  // Opening a bid starts at what the rider offered — taking the offer as it
  // stands is the common move, and undercutting is a drag away.
  return { min, max, start: Math.min(Math.max(offered || max, min), max) };
}

/** A range the driver can actually bid inside. `{ min: 0, max: 0 }` is not. */
function usable(bounds?: BidBounds | null): bounds is BidBounds {
  return (
    bounds != null &&
    typeof bounds.min === 'number' &&
    typeof bounds.max === 'number' &&
    bounds.max > bounds.min
  );
}

/**
 * Whole seconds left on the card. `0` for a missing or unparseable `expiresAt`,
 * so a ride with no window is treated as closed rather than as open forever.
 */
function secondsUntil(expiresAt?: string): number {
  if (!expiresAt) {
    return 0;
  }
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) {
    return 0;
  }
  return Math.max(0, Math.floor((at - Date.now()) / 1000));
}
