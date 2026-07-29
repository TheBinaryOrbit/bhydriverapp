/** Shared formatting for the QuickRide surfaces. */

/** `₹1,250`. Rounded — the API never quotes paise to the driver. */
export function rupees(amount?: number | null): string {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return '—';
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** `24.3 km`, or `800 m` under a kilometre. */
export function distance(km?: number | null): string | null {
  if (typeof km !== 'number' || Number.isNaN(km)) {
    return null;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** `58 min`, or `1 h 12 m` once it runs past the hour. */
export function duration(minutes?: number | null): string | null {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) {
    return null;
  }
  const whole = Math.round(minutes);
  if (whole < 60) {
    return `${whole} min`;
  }
  return `${Math.floor(whole / 60)} h ${whole % 60} m`;
}

/** Joins the parts a card actually has, dropping the ones it doesn't. */
export function summaryLine(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}
