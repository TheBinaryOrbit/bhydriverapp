import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * The ride request card, drawn on top of whatever the driver is actually using.
 *
 * A QuickRide is a bidding window measured in seconds and drivers spend their
 * shift inside Maps, on calls, or with the screen off. A notification in the
 * shade loses that race — it needs to be pulled down, read, and tapped, and by
 * then the ride is gone. This draws the card itself, over the foreground app,
 * with the whole decision already on it: the offer, a slider to name a different
 * fare, and the slide-to-confirm that commits to it.
 *
 * Both products come through here — QuickRide and Outstation — and the card
 * carries a `tag` saying which, because they are answered differently. A
 * QuickRide bid is a race the driver has seconds to enter; an outstation bid
 * stands for days on a trip that may depart next month. The card cannot let
 * those two look alike: they arrive on the same window, one after the other, at
 * a moment the driver is looking at another app entirely.
 *
 * It is the in-app bid card, and that is the design constraint rather than a
 * coincidence. The overlay used to offer one fixed price on a button, so a
 * driver who wanted any other number had to open the app and find the ride again
 * with the clock running. Same layout, same gesture, same range — the only
 * difference is which app is underneath. There is no way *into* the app from the
 * card, for the same reason: with the range on it there is nothing over there
 * left to go for, and the ✕ is the honest way to decline.
 *
 * The view is native rather than React on purpose. An overlay lives in its own
 * window outside the activity, so it has to be able to appear when no activity
 * exists at all — which is the entire case it is for.
 *
 * Needs `SYSTEM_ALERT_WINDOW`, which is a settings-screen grant rather than a
 * runtime permission and is asked for at the duty switch; see
 * `services/driverPermissions.ts`. Without it `show` resolves `false` and the
 * driver falls back to the notification.
 *
 * Android-only, and `get` rather than `getEnforcing` — iOS has no equivalent
 * window type and never will.
 */

/** What the driver did with the card. */
export type RideOverlayAction = {
  /**
   * - `bid` — the slide-to-confirm was completed, at `fare`.
   * - `dismiss` — the ✕, or the card timing out on its own.
   */
  action: string;
  rideId: string;
  /**
   * Where the driver left the slider. Meaningful for `bid` and nothing else —
   * the fare is chosen on the card now, so the caller must not re-derive it from
   * what the rider offered.
   */
  fare: number;
};

/**
 * The fields the card draws.
 *
 * Text arrives pre-formatted, because currency, distance units and the driver's
 * chosen language all live in JS and Kotlin has no business re-deriving any of
 * them. The bid range is the exception and arrives as numbers: the fare changes
 * under the driver's thumb sixty times a second, and a round trip to JS for each
 * one would be a laggy slider on the surface with the least time to spare.
 * `currency` is what lets Kotlin render those numbers without owning the rule.
 */
export type RideOverlayCard = {
  rideId: string;

  /**
   * Which product this is — "QuickRide" or "Outstation", already translated.
   * Drawn as a chip in the card's top-left corner, and the first thing on it: a
   * driver reads the tag before the fare, because ₹2,400 means something
   * different on a trip to another city than it does on a ride across town.
   */
  tag: string;
  /**
   * The chip's fill, as `#rrggbb`. The palette lives in `theme/colors` and JS
   * owns it for the same reason it owns the strings — Kotlin has no business
   * knowing which product is orange.
   */
  tagColor: string;

  pickup: string;
  drop: string;
  /** What the rider is offering, pre-formatted — e.g. "₹420". */
  fare: string;
  /** Pre-formatted, e.g. "2.4 km away · 7.1 km trip". */
  detail: string;

  /**
   * The bid range, as `bidBounds` gives it. `bidMax <= bidMin` is the honest way
   * to say "no usable range": the card then hides the slider and the swipe
   * commits at `bidStart`, which is what the old fixed button did.
   */
  bidMin: number;
  bidMax: number;
  /** Where the slider starts — the offered fare, clamped into the range. */
  bidStart: number;
  /** Rupee granularity of the drag and the − / + buttons. */
  bidStep: number;
  /** Prefixed to every number Kotlin formats. "₹". */
  currency: string;

  /** Above the stepper, e.g. "Your fare". */
  fareLabel: string;
  /**
   * The slide-to-confirm label, with `{fare}` where the amount goes — e.g.
   * "Swipe to bid {fare}". Substituted on every slider move, which is why this
   * is a template rather than a finished string.
   */
  swipeLabel: string;

  /**
   * Seconds until the card removes itself.
   *
   * For a QuickRide this is the ride's own `expiresAt` — a card left on screen
   * past it can only produce a bid the server rejects. For an outstation trip
   * the offer runs for hours, so it is instead how long the window sits over
   * the driver's other app before getting out of the way.
   */
  expiresInSeconds: number;
  /**
   * Whether the seconds are drawn in the pill next to the fare.
   *
   * True for a QuickRide, where the number *is* the decision — this much money,
   * this much time to take it. False for an outstation trip: the card goes away
   * on its own but the offer does not, and a ticking clock on a trip the driver
   * has until tomorrow to bid on would be a lie that costs them work.
   */
  showCountdown: boolean;
};

export interface Spec extends TurboModule {
  /**
   * Draws the card, replacing any card already up — a newer request supersedes
   * an older one rather than stacking windows the driver has to clear.
   *
   * Resolves `false` when the overlay grant is missing, which is the caller's
   * cue to leave the request to the notification instead.
   */
  show(card: RideOverlayCard): Promise<boolean>;

  /** Takes the card down. Safe when nothing is showing. */
  hide(): void;

  /**
   * Brings the app to the front, starting it if the driver had swiped it away.
   *
   * Native because JS cannot: the caller may be a headless task with no activity
   * anywhere in the process. Used after a bid placed from the card — a driver
   * who has just committed money needs to land somewhere that says so.
   */
  openApp(): void;

  /** Whether a card is on screen right now. Synchronous — it reads a field. */
  isShowing(): boolean;

  /** Every tap, plus the `dismiss` the card sends when its timer runs out. */
  readonly onAction: CodegenTypes.EventEmitter<RideOverlayAction>;
}

export default TurboModuleRegistry.get<Spec>('RideOverlay');
