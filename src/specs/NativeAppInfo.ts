import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * What build of the app this actually is.
 *
 * `GET /settings/:type` sends back the build the store is on, and the gate is a
 * comparison against **this device's** `versionCode` — a number that lives in
 * `android/app/build.gradle` and is stamped into `BuildConfig` at compile time.
 * Nothing in React Native exposes it: `Platform.constants` carries the *OS*
 * version and the device model, and stops there. Hence this module.
 *
 * Deliberately not a JS constant kept "in sync" with the gradle file. One that
 * drifts low nags every driver on the latest build forever; one that drifts high
 * silently switches the force-update gate off. The number has to come from the
 * binary.
 *
 * `get` (not `getEnforcing`) so iOS gets `null` rather than a crash — see
 * `services/appSettings.ts`, which reads a missing module as "we cannot tell
 * which build this is" and skips the gate rather than guessing.
 */
export interface Spec extends TurboModule {
  /** `versionName` — the display string, e.g. `1.2.0`. Never compared. */
  getVersion(): string;
  /**
   * `versionCode` — the store's monotonic integer, and the only field that
   * compares correctly against the server's `appBuildNumber`.
   */
  getBuildNumber(): number;
  /** `applicationId`, for the store link the update prompt opens. */
  getPackageName(): string;
}

export default TurboModuleRegistry.get<Spec>('AppInfo');
