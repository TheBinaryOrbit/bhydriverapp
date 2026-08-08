import {
  lastKnownFix,
  startDriverWatch,
  takeDriverFix,
} from '../hooks/useDriverLocation';
import { driverSocket } from '../services/driverSocket';
import { startDutyService, stopDutyService } from '../services/dutyService';
import { getToken } from '../storage/authStorage';

/**
 * The shift, running with nothing on screen.
 *
 * Registered in `index.js` and started by `DutyService`. Two things make it
 * necessary, and neither is optional:
 *
 * **It is what keeps React Native's timers alive.** Timers are driven by a
 * Choreographer frame callback that RN removes on `onHostPause`, so the 5s
 * `driver:location` ping stops the instant the last activity pauses — with the
 * driver still sitting in the dispatch index at a position that no longer
 * moves. An active headless task puts the callback back for as long as it runs,
 * which is why this promise never resolves: `DutyService.releaseJsRuntime`
 * finishes the task natively when the driver goes offline, and nothing else
 * ends it.
 *
 * **It is what rebuilds the shift from nothing.** After Android reclaims the
 * process, `START_STICKY` brings the service back and the service starts a
 * React context — but that context has no socket, no fix and no idea a shift
 * was running. Everything below the `isOnDuty` check is that rebuild.
 */
export async function dutyTask(): Promise<void> {
  await resume();

  // Never settles. The task ends when the driver does, from the native side.
  return new Promise<void>(() => {});
}

/**
 * Puts the driver back in the index after a cold start, or does nothing at all
 * on the warm one.
 *
 * The warm path is the common one: the driver tapped the switch a moment ago,
 * `useDuty` has already had its ack, and this task exists only to hold the
 * timers open. Re-announcing there would be a second `driver:online` for a
 * driver who is already online.
 */
async function resume(): Promise<void> {
  if (driverSocket.isOnDuty) {
    // The watch belongs to a screen that may since have unmounted — claiming it
    // for duty is what stops the GPS going quiet behind a closed app.
    startDriverWatch();
    return;
  }

  const token = await getToken();
  if (!token) {
    // Signed out while the service was down. There is no shift to resume and
    // no one to tell, so take the notification away rather than leave it
    // offering a way back into an account that is gone.
    stopDutyService();
    return;
  }

  driverSocket.connect(token);
  startDriverWatch();

  // A fresh process has no last position, and `driver:online` is refused
  // without one.
  const fix = lastKnownFix() ?? (await takeDriverFix());
  if (!fix) {
    return;
  }

  const ack = await driverSocket.goOnline({
    latitude: fix.lat,
    longitude: fix.lng,
  });
  if (!ack.ok) {
    // KYC lapsed, the vehicle was removed, or the socket never came up. The
    // "your shift was interrupted" notification the service is already showing
    // is the correct thing to leave on screen — it asks for the tap that brings
    // the driver somewhere they can see why.
    if (__DEV__) {
      console.warn('[duty] could not resume the shift —', ack.message);
    }
    return;
  }

  // Back in the index for real, so the notification stops saying otherwise.
  startDutyService();
}
