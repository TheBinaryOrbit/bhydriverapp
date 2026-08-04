import { useCallback, useEffect, useState } from 'react';

import { getWelcomedDriverId, markWelcomed } from '../storage/authStorage';

export type WelcomeState = {
  /** The celebration is due — this driver hasn't been greeted yet. */
  visible: boolean;
  dismiss: () => void;
};

/**
 * Whether to greet the driver on the home screen, and how to put the greeting
 * away for good.
 *
 * Fires once per sign-in: the marker is written the moment the sheet is
 * dismissed, so a reload, a tab switch or the next launch won't repeat it.
 * Signing out clears the marker along with the rest of the session, so the next
 * driver to sign in on this phone gets their own welcome.
 */
export function useWelcome(driverId?: string | null): WelcomeState {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!driverId) {
      return;
    }
    let cancelled = false;

    getWelcomedDriverId()
      .then(welcomed => {
        if (!cancelled && welcomed !== driverId) {
          setVisible(true);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [driverId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (driverId) {
      // Nothing waits on this: the sheet is already gone, and a failed write
      // costs one extra greeting rather than a stuck screen.
      markWelcomed(driverId).catch(() => {});
    }
  }, [driverId]);

  return { visible, dismiss };
}
