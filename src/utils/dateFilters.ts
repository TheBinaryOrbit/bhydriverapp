/**
 * Date presets for the ride history filter.
 *
 * `GET /quick-rides/my` reads `date` / `from` / `to` as **IST calendar days**,
 * so every boundary is computed in IST rather than device-local time. A driver
 * whose phone clock sits in another timezone — or who opens the app near
 * midnight — still asks for the day the server means.
 */

/** IST is UTC+5:30 year-round with no DST, so a fixed shift is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DatePresetKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth';

/** Presentation order in the filter sheet, widest first. */
export const DATE_PRESETS: DatePresetKey[] = [
  'all',
  'today',
  'yesterday',
  'last7',
  'thisMonth',
  'lastMonth',
];

/** The subset of `RideHistoryFilter` a preset fills in. */
export type DateRange = { date?: string; from?: string; to?: string };

/**
 * The IST calendar day an instant falls on, as `YYYY-MM-DD`.
 *
 * Shifting the instant and then reading it as UTC is what makes this correct
 * without a timezone database: the UTC rendering of the shifted moment *is* the
 * IST wall clock.
 */
function istDay(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The `date` / `from` / `to` a preset resolves to. `all` sends nothing. */
export function presetRange(
  key: DatePresetKey,
  now: number = Date.now(),
): DateRange {
  switch (key) {
    case 'today':
      return { date: istDay(now) };

    case 'yesterday':
      return { date: istDay(now - DAY_MS) };

    // Today counts as one of the seven, so it's six days back, not seven.
    case 'last7':
      return { from: istDay(now - 6 * DAY_MS) };

    case 'thisMonth':
      return { from: `${istDay(now).slice(0, 7)}-01` };

    case 'lastMonth': {
      const [year, month] = istDay(now).split('-').map(Number);
      // Month is 1-based here and 0-based in `Date.UTC`, so `month - 2` is the
      // previous month — and rolls back into December of the prior year on its
      // own. Day 0 of this month is the last day of that one.
      const start = new Date(Date.UTC(year, month - 2, 1));
      const lastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
      const stamp = `${start.getUTCFullYear()}-${pad(
        start.getUTCMonth() + 1,
      )}`;
      return { from: `${stamp}-01`, to: `${stamp}-${pad(lastDay)}` };
    }

    default:
      return {};
  }
}
