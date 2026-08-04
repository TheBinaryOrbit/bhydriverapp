import { useCallback, useEffect, useRef, useState } from 'react';

import { lastKnownFix, stopDriverWatch } from './useDriverLocation';
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
 */

/**
 * Why the driver could not go on duty. `kyc` and `vehicle` are actionable and
 * get a button; the rest are transient and get a retry.
 */
export type DutyBlock = {
  kind: 'kyc' | 'vehicle' | 'location' | 'connection' | 'unknown';
  message?: string;
};

export type DutyControls = {
  link: LinkStatus;
  onDuty: boolean;
  /** True while `driver:online` is in flight. */
  switching: boolean;
  dutyBlock: DutyBlock | null;
  /**
   * Duty is pinned on and `goOffline` will not act — a rider is tracking this
   * driver, so the location ping has to keep running.
   */
  dutyLocked: boolean;
  goOnline: () => Promise<void>;
  goOffline: () => void;
  clearDutyBlock: () => void;
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
      }),
    ];

    // The socket outlives this screen on purpose — unmounting only drops the
    // listeners, never the connection.
    return () => off.forEach(unsubscribe => unsubscribe());
  }, []);

  const goOnline = useCallback(async () => {
    if (switching) {
      return;
    }
    setSwitching(true);
    setDutyBlock(null);

    try {
      /**
       * A fix we already have beats a fresh one, every time. `driver:online`
       * only needs to know which cell of the geo index this driver belongs in,
       * and the watch that starts a moment later corrects it within seconds —
       * so waiting on the GPS here would buy accuracy nobody reads at the cost
       * of the one thing the driver does notice, which is the switch hanging.
       */
      const fix = lastKnownFix() ?? (await latest.current.requestLocation());
      if (!fix) {
        setDutyBlock({ kind: 'location' });
        return;
      }

      const ack: OnlineAck = await driverSocket.goOnline({
        latitude: fix.lat,
        longitude: fix.lng,
      });

      if (ack.ok) {
        setOnDuty(true);
        latest.current.startWatching();
        latest.current.onWentOnline?.();
        return;
      }
      setDutyBlock(blockFromAck(ack.message));
    } finally {
      setSwitching(false);
    }
  }, [switching]);

  const goOffline = useCallback(() => {
    // Refused while any hold is registered. The panel disables the switch; this
    // is the backstop for a tap that lands as a ride is assigned.
    if (!driverSocket.goOffline()) {
      return;
    }
    stopDriverWatch();
    setOnDuty(false);
    latest.current.onWentOffline?.();
  }, []);

  const clearDutyBlock = useCallback(() => setDutyBlock(null), []);

  return {
    link,
    onDuty,
    switching,
    dutyBlock,
    dutyLocked: locked || held,
    goOnline,
    goOffline,
    clearDutyBlock,
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
