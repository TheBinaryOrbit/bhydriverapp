/**
 * Formatting for the outstation surfaces.
 *
 * Everything here exists because of one difference from QuickRide: a trip's
 * defining number is *when it departs*, and that can be anything from ten
 * minutes to thirty days out. A single absolute timestamp reads badly across
 * that whole range, so departures are phrased relative to today and the
 * lead time is stated separately.
 *
 * Money, distance and duration are unchanged between the products and are
 * re-exported from the QuickRide helpers rather than forked.
 */

export { distance, duration, rideMoment, rupees, summaryLine } from '../quickride/format';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `4:30 pm`, in the device's locale. */
function clockTime(date: Date): string {
  return date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
}

/** `Wed, 5 Aug` — the year is added only once the date leaves this one. */
function calendarDay(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === new Date().getFullYear()
      ? null
      : { year: 'numeric' }),
  });
}

/** Whole days between two instants by *calendar day*, not by elapsed hours. */
function dayGap(from: Date, to: Date): number {
  const startOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOf(to) - startOf(from)) / DAY_MS);
}

/**
 * When the trip leaves, as a driver would say it.
 *
 * `Today, 4:30 pm` · `Tomorrow, 9:00 am` · `Wed, 5 Aug · 9:00 am`. Today and
 * tomorrow are named rather than dated because those are the two the driver has
 * to act on, and a bare date makes them look like every other row.
 *
 * `t` is passed in rather than the hook being called here so this stays usable
 * from a `useMemo` or a list key.
 */
export function departureLabel(
  iso: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
  now: number = Date.now(),
): string | null {
  const at = new Date(iso ?? '');
  if (!iso || Number.isNaN(at.getTime())) {
    return null;
  }

  const gap = dayGap(new Date(now), at);
  const time = clockTime(at);

  if (gap === 0) {
    return t('outstation.departToday', { time });
  }
  if (gap === 1) {
    return t('outstation.departTomorrow', { time });
  }
  // A pickup in the past is a trip the driver is late for, or one they took and
  // never started. Either way the honest label is the date it was due.
  return `${calendarDay(at)} · ${time}`;
}

/**
 * How far off the departure is — `in 25 min`, `in 6 h`, `in 3 days`, or
 * `overdue` once it has passed.
 *
 * This is the number that decides whether a driver can still take QuickRides
 * (the 2-hour block window), so it is shown next to the departure rather than
 * left for them to work out.
 */
export function leadTime(
  iso: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
  now: number = Date.now(),
): string | null {
  const at = new Date(iso ?? '');
  if (!iso || Number.isNaN(at.getTime())) {
    return null;
  }

  const ms = at.getTime() - now;
  if (ms <= 0) {
    return t('outstation.departOverdue');
  }
  if (ms < HOUR_MS) {
    return t('outstation.inMinutes', { count: Math.max(1, Math.round(ms / MINUTE_MS)) });
  }
  if (ms < DAY_MS) {
    return t('outstation.inHours', { count: Math.round(ms / HOUR_MS) });
  }
  return t('outstation.inDays', { count: Math.round(ms / DAY_MS) });
}

/**
 * `OUTSTATION_QUICKRIDE_BLOCK_MINUTES` — inside this window an accepted trip
 * also blocks QuickRide, so the driver stops earning and sets off.
 */
export const PICKUP_IMMINENT_MS = 2 * HOUR_MS;

/** True once an accepted trip's departure is close enough to block QuickRide. */
export function isPickupImminent(
  iso: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const at = new Date(iso ?? '');
  if (!iso || Number.isNaN(at.getTime())) {
    return false;
  }
  return at.getTime() - now <= PICKUP_IMMINENT_MS;
}

/**
 * Whether an offer's expiry is close enough to be worth a live countdown.
 *
 * `expiresAt` is `createdAt + 24h`. Ticking a 23-hour clock on a card is noise,
 * so the chip only appears in the last hour — the point at which it changes
 * what the driver does.
 */
export const EXPIRY_COUNTDOWN_THRESHOLD_S = 60 * 60;
