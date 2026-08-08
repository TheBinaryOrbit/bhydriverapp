import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * The foreground service that keeps duty alive once the driver leaves the app.
 *
 * Android does not suspend a process that owns a running foreground service, so
 * this is what keeps the socket connected, the 5s `driver:location` ping firing
 * and the GPS watch delivering while the driver is inside Maps or has the screen
 * off. Everything that *uses* those stays in JS exactly as it is — the service
 * holds the process open, it does not reimplement dispatch in Kotlin.
 *
 * It is also the only legal way to receive background location from Android 10
 * onwards: the grant alone is not enough, the app must additionally have a
 * service of type `location` in the foreground. That is why this and
 * `NativeDriverPermissions.backgroundLocation` are useless apart — going on duty
 * needs both.
 *
 * The persistent notification is not optional and cannot be hidden. Android
 * requires it, and it is the honest signal that the app is tracking: it appears
 * when the driver goes online and disappears the moment they go offline.
 *
 * Android-only. `get`, not `getEnforcing`, so iOS gets `null`; see
 * `services/dutyService.ts`, the only caller, which treats a missing module as
 * "the platform handles this itself".
 */
export interface Spec extends TurboModule {
  /**
   * Starts the service, or updates the notification text if it is already
   * running. `title` and `body` are passed in rather than read from a string
   * resource so the notification follows the driver's chosen app language
   * instead of the device's.
   *
   * Resolves `false` when Android refused the start — a missing location grant
   * on API 34+, or a background start on API 31+. Never rejects: duty failing to
   * survive backgrounding is a degraded shift, not a crash.
   */
  start(title: string, body: string): Promise<boolean>;

  /** Stops the service and clears the notification. Safe when not running. */
  stop(): void;

  /** Whether the service is up right now. Synchronous — it reads a flag. */
  isRunning(): boolean;
}

export default TurboModuleRegistry.get<Spec>('DutyService');
