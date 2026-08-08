import { Platform } from 'react-native';
import i18n from 'i18next';

import NativeDutyService from '../specs/NativeDutyService';

/**
 * The foreground service, tied to the duty switch.
 *
 * Duty is a promise to a rider that this driver's position keeps moving. The
 * app cannot keep that promise on its own: Android suspends a backgrounded
 * process, taking the socket, the 5s ping and the GPS watch with it, and refuses
 * background fixes to an app with no `location` service in the foreground. The
 * service answers both, so it starts and stops with duty and nowhere else.
 *
 * Nothing here is load-bearing for *going* online. A driver whose service fails
 * to start is still in the dispatch index and still gets rides while the app is
 * open — they lose the part that survives them leaving it. So every call here is
 * best-effort and the caller is told what happened rather than blocked by it.
 */

/** iOS keeps its own background modes; there is no service to run. */
const SUPPORTED = Platform.OS === 'android';

/**
 * Starts it, or updates the notification if it is already up.
 *
 * `false` means duty will not survive the app being backgrounded — Android
 * refused the start, or this build has no native module. Callers surface that
 * as a warning; it is never a reason to refuse the shift.
 */
export async function startDutyService(): Promise<boolean> {
  if (!SUPPORTED || !NativeDutyService) {
    return false;
  }
  try {
    return await NativeDutyService.start(
      i18n.t('duty.serviceTitle'),
      i18n.t('duty.serviceBody'),
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[duty] service would not start —', error);
    }
    return false;
  }
}

/**
 * Stops it. Called on going offline — and only there, because the notification
 * disappearing is how a driver reads "I am no longer being sent rides".
 */
export function stopDutyService(): void {
  if (!SUPPORTED || !NativeDutyService) {
    return;
  }
  try {
    NativeDutyService.stop();
  } catch (error) {
    if (__DEV__) {
      console.warn('[duty] service would not stop —', error);
    }
  }
}

/**
 * Whether the process is currently being held open.
 *
 * Worth re-reading when the app returns to the foreground: `START_STICKY` means
 * Android may have restarted the service after reclaiming the process, and an
 * OEM battery manager may have killed it without restarting it at all.
 */
export function isDutyServiceRunning(): boolean {
  if (!SUPPORTED || !NativeDutyService) {
    return false;
  }
  try {
    return NativeDutyService.isRunning();
  } catch {
    return false;
  }
}
