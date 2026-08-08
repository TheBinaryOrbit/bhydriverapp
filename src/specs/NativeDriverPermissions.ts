import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * The two Android grants that are *not* runtime permissions.
 *
 * "Display over other apps" and "unrestricted battery" are special app access
 * settings: there is no `requestPermissions` dialog for either, only a settings
 * screen you send the driver to and a state you read back afterwards. Neither
 * `PermissionsAndroid` nor anything else in React Native can see them, which is
 * the whole reason this module exists.
 *
 * Every method resolves `false` rather than rejecting when the grant simply
 * isn't there — a driver declining is not an error. Rejections are reserved for
 * the cases where the request could not be *put* to them at all (no activity in
 * the foreground, or a ROM with the settings screen stripped out).
 *
 * Android-only. `get` (not `getEnforcing`) so that iOS gets `null` instead of a
 * crash; see `services/driverPermissions.ts`, which is the only caller and
 * treats a missing module as "nothing to ask for".
 */
export interface Spec extends TurboModule {
  /** `Settings.canDrawOverlays` — the overlay grant, right now. */
  canDrawOverlays(): Promise<boolean>;

  /**
   * Opens the overlay settings screen and resolves with the grant as it stands
   * when the driver comes back. Resolves `true` immediately if already granted.
   */
  requestOverlay(): Promise<boolean>;

  /** `PowerManager.isIgnoringBatteryOptimizations` for this package. */
  isIgnoringBatteryOptimizations(): Promise<boolean>;

  /**
   * Shows the system "let this app run in the background?" dialog and resolves
   * with the state afterwards. Resolves `true` immediately if already exempt.
   */
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('DriverPermissions');