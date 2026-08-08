/**
 * Which half of the home screen is showing, kept outside React.
 *
 * `HomeScreen` used to own this as plain local state, which was right until
 * something off the tree needed it. The new-ride snackbar needs it twice over,
 * and neither use can reach into a component:
 *
 * - **To stay quiet.** A snackbar announcing a QuickRide to a driver already
 *   looking at the QuickRide list is noise on top of the card it is pointing at.
 *   Suppressing that means *reading* the current tab from outside.
 * - **To switch.** Tapping the snackbar has to land the driver on the tab that
 *   matches the ride, which means *writing* it from outside.
 *
 * A route param would do the second but not the first, and would need a nonce to
 * re-fire when the driver has since switched tabs by hand. This is the smaller
 * thing: one value, two directions, and `HomeScreen` renders whatever it says.
 */

export type HomeTab = 'quickRide' | 'outstation';

/** QuickRide is the tab the app opens on, so it is what this starts as. */
let current: HomeTab = 'quickRide';

const listeners = new Set<(tab: HomeTab) => void>();

export function currentHomeTab(): HomeTab {
  return current;
}

/**
 * Switches the tab. Called by the segmented control when the driver taps, and by
 * the snackbar when they follow a ride — the two paths are deliberately the same
 * one, so nothing can get the store and the screen out of step.
 */
export function setHomeTab(tab: HomeTab): void {
  if (current === tab) {
    return;
  }
  current = tab;
  listeners.forEach(listener => listener(tab));
}

/** Subscribe to tab changes. Returns the unsubscribe. */
export function onHomeTabChange(listener: (tab: HomeTab) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
