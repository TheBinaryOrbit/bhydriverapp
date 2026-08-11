/**
 * How many outstation trips are on offer, kept outside React.
 *
 * The badge lives on the segmented control in `HomeScreen`, and the number lives
 * in `useOutstation` — a hook inside the tab the badge is pointing *at*. Lifting
 * the hook to the screen would mean the whole list, its socket subscriptions and
 * its `/live` resume moving with it, so the one value the header needs is
 * published here instead and the tab stays the only thing that owns trips.
 *
 * Same shape as `homeTab` for the same reason: one value, read and written from
 * either side of the tree, with no context and no re-render of anything that
 * did not ask for it.
 */

let current = 0;

const listeners = new Set<(count: number) => void>();

export function currentOutstationCount(): number {
  return current;
}

/**
 * Called by `OutstationTab` whenever its list changes — including with `0` when
 * the tab unmounts, so a signed-out driver is not left with a stale badge.
 */
export function setOutstationCount(count: number): void {
  const next = Math.max(0, count);
  if (current === next) {
    return;
  }
  current = next;
  listeners.forEach(listener => listener(next));
}

/** Subscribe to changes. Returns the unsubscribe. */
export function onOutstationCountChange(
  listener: (count: number) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
