import { useCallback, useEffect, useRef, useState } from 'react';

import { lastKnownFix, stopDriverWatch } from './useDriverLocation';
import { missingDriverPermissions } from '../services/driverPermissions';
import { startDutyService, stopDutyService } from '../services/dutyService';
import {
  driverSocket,
  type LinkStatus,
  type OnlineAck,
} from '../services/driverSocket';
import type { LatLng } from '../types/quickRide';

/**
 * Duty — one switch, two tabs.
 *
 * Duty is a property of the socket, not of a screen: `driverSocket` owns it and
 * broadcasts every change. So this hook may be mounted more than once at a time
 * (QuickRide and Outstation both show the switch) without the two ever
 * disagreeing — each instance reads the same broadcast, and whichever one the
 * driver taps moves both.
 *
 * What stays with the caller is what going on duty *means for their list*:
 * `onWentOnline` is where a tab reloads the cards that went stale while the
 * driver was off.
 *
 * Going online is also where the background grants are asked for — background
 * location, drawing over other apps, and battery exemption. They belong here
 * rather than at launch or in onboarding for two reasons: this is the first
 * moment any of them does anything, and it is the only moment the driver has a
 * reason to say yes. See `services/driverPermissions` and `PermissionGateSheet`.
 */

/**
 * Why the driver could not go on duty. `kyc` and `vehicle` are actionable and
 * get a button; the rest are transient and get a retry.
 */
export type DutyBlock = {
  kind: 'kyc' | 'vehicle' | 'location' | 'connection' | 'unknown';
  message?: string;
};

/** `goOnline` options. */
export type GoOnlineOptions = {
  /**
   * Ask for the background grants first when any are missing (default). Set
   * `false` for the paths that must not be interruptible — resuming duty for a
   * ride already in progress, and the sheet's own "go online" button.
   */
  prompt?: boolean;
};

export type DutyControls = {
  link: LinkStatus;
  onDuty: boolean;
  /** True while `driver:online` is in flight. */
  switching: boolean;
  dutyBlock: DutyBlock | null;
  /**
   * On duty, but the foreground service would not start — so this shift lasts
   * only as long as the app is on screen. A warning rather than a block: the
   * driver is genuinely online and genuinely getting rides right now.
   */
  backgroundUnavailable: boolean;
  /**
   * Duty is pinned on and `goOffline` will not act — a rider is tracking this
   * driver, so the location ping has to keep running.
   */
  dutyLocked: boolean;
  /** The permission sheet is open — `driver:online` is waiting on it. */
  permissionGate: boolean;
  goOnline: (options?: GoOnlineOptions) => Promise<void>;
  goOffline: () => void;
  clearDutyBlock: () => void;
  clearBackgroundWarning: () => void;
  /** Closes the sheet and stays offline. */
  dismissPermissionGate: () => void;
  /** Closes the sheet and finishes going online. */
  continueAfterPermissions: () => Promise<void>;
};

type Params = {
  /** Prompts for GPS and returns a fix; used right before `driver:online`. */
  requestLocation: () => Promise<LatLng | null>;
  startWatching: () => void;
  /** A live ride of the caller's own. Locks the switch on top of any hold. */
  locked?: boolean;
  /** Ran once `driver:online` is acked — the caller's list is stale by then. */
  onWentOnline?: () => void;
  onWentOffline?: () => void;
};

export function useDuty({
  requestLocation,
  startWatching,
  locked = false,
  onWentOnline,
  onWentOffline,
}: Params): DutyControls {
  const [link, setLink] = useState<LinkStatus>(driverSocket.linkStatus);
  const [onDuty, setOnDuty] = useState(driverSocket.isOnDuty);
  const [held, setHeld] = useState(driverSocket.dutyState.held);
  const [switching, setSwitching] = useState(false);
  const [dutyBlock, setDutyBlock] = useState<DutyBlock | null>(null);
  const [permissionGate, setPermissionGate] = useState(false);
  const [backgroundUnavailable, setBackgroundUnavailable] = useState(false);

  // Read inside socket handlers, which are registered once and would otherwise
  // close over the first render's values.
  const latest = useRef({
    requestLocation,
    startWatching,
    onWentOnline,
    onWentOffline,
  });
  latest.current = {
    requestLocation,
    startWatching,
    onWentOnline,
    onWentOffline,
  };

  /**
   * Starts the foreground service that makes duty outlive the app being on
   * screen. Deliberately not awaited by its callers: the switch has already
   * flipped and the driver is already in the index, so the only thing hanging
   * on this is whether a warning appears a moment later.
   */
  const holdProcessOpen = useCallback(() => {
    startDutyService().then(started => setBackgroundUnavailable(!started));
  }, []);

  useEffect(() => {
    const off = [
      driverSocket.onLinkChange(setLink),

      driverSocket.onDutyChange(state => {
        setOnDuty(state.onDuty);
        setHeld(state.held);
      }),

      // Back in the index with the cached vehicle — no `driver:online` needed.
      driverSocket.on('driver:resumed', () => {
        setOnDuty(true);
        setDutyBlock(null);
        latest.current.startWatching();
        // A resume usually follows a reconnect the driver never saw, but it can
        // also follow the process being rebuilt — in which case the service is
        // gone and duty would silently stop surviving the app again.
        holdProcessOpen();
      }),
    ];

    // The socket outlives this screen on purpose — unmounting only drops the
    // listeners, never the connection. The service outlives it too: this hook
    // is mounted per tab, and duty is not.
    return () => off.forEach(unsubscribe => unsubscribe());
  }, [holdProcessOpen]);

  const goOnline = useCallback(
    async ({ prompt = true }: GoOnlineOptions = {}) => {
      if (switching) {
        return;
      }
      setSwitching(true);
      setDutyBlock(null);

      try {
        /**
         * A fix we already have beats a fresh one, every time. `driver:online`
         * only needs to know which cell of the geo index this driver belongs
         * in, and the watch that starts a moment later corrects it within
         * seconds — so waiting on the GPS here would buy accuracy nobody reads
         * at the cost of the one thing the driver does notice, which is the
         * switch hanging.
         */
        const fix = lastKnownFix() ?? (await latest.current.requestLocation());
        if (!fix) {
          setDutyBlock({ kind: 'location' });
          return;
        }

        /**
         * The background grants, asked for after the fix and not before.
         *
         * Order matters: Android ignores a background-location request from an
         * app that doesn't already hold the foreground one, and silently spends
         * one of the driver's two refusals doing it. Getting the fix first is
         * what guarantees we hold it. The cost is nothing in practice — a
         * driver flipping the switch almost always has `lastKnownFix` already.
         */
        if (prompt && (await missingDriverPermissions()).length > 0) {
          setPermissionGate(true);
          return;
        }

        const ack: OnlineAck = await driverSocket.goOnline({
          latitude: fix.lat,
          longitude: fix.lng,
        });

        if (ack.ok) {
          setOnDuty(true);
          latest.current.startWatching();
          // After the ack, not before: a service started for a shift the server
          // then refused would leave a notification claiming the driver is
          // online when they are not.
          holdProcessOpen();
          latest.current.onWentOnline?.();
          return;
        }
        setDutyBlock(blockFromAck(ack.message));
      } finally {
        setSwitching(false);
      }
    },
    [switching, holdProcessOpen],
  );

  const dismissPermissionGate = useCallback(() => setPermissionGate(false), []);

  /**
   * The sheet's own button. It only enables once the required grants are in, so
   * this goes straight through rather than re-opening the sheet it was tapped
   * on — the driver has just answered that question.
   */
  const continueAfterPermissions = useCallback(() => {
    setPermissionGate(false);
    return goOnline({ prompt: false });
  }, [goOnline]);

  const goOffline = useCallback(() => {
    // Refused while any hold is registered. The panel disables the switch; this
    // is the backstop for a tap that lands as a ride is assigned.
    if (!driverSocket.goOffline()) {
      return;
    }
    stopDriverWatch();
    // The notification going away is how a driver reads "I have stopped being
    // sent rides", so this has to happen on the same tap, not on a timer.
    stopDutyService();
    setOnDuty(false);
    setBackgroundUnavailable(false);
    latest.current.onWentOffline?.();
  }, []);

  const clearDutyBlock = useCallback(() => setDutyBlock(null), []);

  const clearBackgroundWarning = useCallback(
    () => setBackgroundUnavailable(false),
    [],
  );

  return {
    link,
    onDuty,
    switching,
    dutyBlock,
    dutyLocked: locked || held,
    backgroundUnavailable,
    permissionGate,
    goOnline,
    goOffline,
    clearDutyBlock,
    clearBackgroundWarning,
    dismissPermissionGate,
    continueAfterPermissions,
  };
}

/**
 * The `driver:online` ack reports the requirement that failed in prose. Match
 * on it so the UI can offer the right button instead of echoing a sentence.
 */
export function blockFromAck(message?: string): DutyBlock {
  if (message === 'no-location') {
    return { kind: 'location' };
  }
  if (message === 'not-connected' || message === 'timeout') {
    return { kind: 'connection' };
  }
  if (message && /kyc/i.test(message)) {
    return { kind: 'kyc', message };
  }
  if (message && /vehicle/i.test(message)) {
    return { kind: 'vehicle', message };
  }
  return { kind: 'unknown', message };
}
