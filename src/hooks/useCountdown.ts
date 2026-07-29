import { useEffect, useRef, useState } from 'react';

import { secondsUntil } from '../types/quickRide';

/**
 * Seconds left until `expiresAt`, ticking once a second.
 *
 * Cards and bids both die on a server timestamp rather than a duration, so the
 * countdown is derived from the clock on every tick — a backgrounded app that
 * missed 40 ticks still comes back with the right number.
 *
 * Returns `null` when there is no deadline. `onExpire` fires exactly once.
 */
export function useCountdown(
  expiresAt?: string | null,
  onExpire?: () => void,
): number | null {
  const [remaining, setRemaining] = useState<number | null>(() =>
    secondsUntil(expiresAt),
  );

  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    const initial = secondsUntil(expiresAt);
    setRemaining(initial);

    if (initial === null) {
      return;
    }
    if (initial <= 0) {
      expireRef.current?.();
      return;
    }

    let fired = false;
    const id = setInterval(() => {
      const left = secondsUntil(expiresAt) ?? 0;
      setRemaining(left);
      if (left <= 0 && !fired) {
        fired = true;
        clearInterval(id);
        expireRef.current?.();
      }
    }, 1000);

    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

/** `m:ss` for anything over a minute, plain seconds below it. */
export function formatCountdown(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
