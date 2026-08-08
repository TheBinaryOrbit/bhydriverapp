import { Linking, PermissionsAndroid, Platform } from 'react-native';

import NativeDriverPermissions from '../specs/NativeDriverPermissions';

/**
 * The four grants a driver needs before duty means anything.
 *
 * Foreground location gets the driver a fix; these are what keep the fix
 * *coming* — and the ride requests *arriving* — once the driver stops looking
 * at the app, which for a driver is within about four seconds of tapping "go
 * online". Each one covers a different way the phone would otherwise quietly
 * drop them out of dispatch:
 *
 * - `backgroundLocation` — Android stops delivering fixes when the app leaves
 *   the screen, so the rider's map freezes and the geo index goes stale.
 * - `notifications` — from Android 13 this is denied until asked for, and a
 *   push to a denied app is discarded in silence. The socket only reaches a
 *   running app; push is the only thing that reaches a backgrounded one.
 * - `overlay` — a ride request has seconds to be seen, and the driver is inside
 *   Maps or on a call. Without this the card can only sit in the shade.
 * - `battery` — Doze and the OEM battery managers kill the app outright. The
 *   driver has no idea it happened; they just stop getting rides.
 *
 * None of the four can be asked for the same way. Notifications are a plain
 * runtime permission from Android 13; background location is a runtime
 * permission on Android 10 and a settings page from 11 onwards; the other two
 * have never been runtime permissions at all and go through
 * `NativeDriverPermissions`. This module is the single place that knows that,
 * so callers get one honest `Record<DriverPermission, boolean>` and one request
 * function that means the same thing for every grant.
 */

export type DriverPermission =
  | 'backgroundLocation'
  | 'notifications'
  | 'overlay'
  | 'battery';

export type DriverPermissionStatus = Record<DriverPermission, boolean>;

export const DRIVER_PERMISSIONS: DriverPermission[] = [
  'backgroundLocation',
  'notifications',
  'overlay',
  'battery',
];

/**
 * The ones that going online is actually refused without.
 *
 * Only background location is here, and it is here because duty without it is a
 * promise the app cannot keep: the driver is told they are online and stays in
 * the index, while their position stops moving the moment the screen does. The
 * other two degrade the shift rather than break it, so they are asked for at
 * the same moment but can be skipped.
 */
export const REQUIRED_DRIVER_PERMISSIONS: DriverPermission[] = [
  'backgroundLocation',
];

/** Android 10 — the release that split background location out of foreground. */
const ANDROID_10 = 29;
/** Android 11 — the release that moved it out of the dialog and into settings. */
const ANDROID_11 = 30;
/** Android 13 — the release that made posting a notification a runtime grant. */
const ANDROID_13 = 33;

function androidApi(): number {
  return Platform.OS === 'android' ? Number(Platform.Version) : 0;
}

/* ------------------------------------------------ reads */

/** Every grant as it stands right now. Never throws. */
export async function readDriverPermissions(): Promise<DriverPermissionStatus> {
  // iOS asks for "Always" location through the plist on first background use,
  // takes its notification prompt through Firebase's own `requestPermission`
  // during registration, and has no equivalent of the other two — so there is
  // nothing for this sheet to gate on.
  if (Platform.OS !== 'android') {
    return {
      backgroundLocation: true,
      notifications: true,
      overlay: true,
      battery: true,
    };
  }

  const [backgroundLocation, notifications, overlay, battery] =
    await Promise.all([
      hasBackgroundLocation(),
      hasNotifications(),
      ask(module => module.canDrawOverlays()),
      ask(module => module.isIgnoringBatteryOptimizations()),
    ]);

  return { backgroundLocation, notifications, overlay, battery };
}

/** Which of `DRIVER_PERMISSIONS` are still missing, in display order. */
export async function missingDriverPermissions(): Promise<DriverPermission[]> {
  const status = await readDriverPermissions();
  return DRIVER_PERMISSIONS.filter(permission => !status[permission]);
}

/** True when every entry in `REQUIRED_DRIVER_PERMISSIONS` is granted. */
export function canGoOnline(status: DriverPermissionStatus): boolean {
  return REQUIRED_DRIVER_PERMISSIONS.every(permission => status[permission]);
}

/* ------------------------------------------------ requests */

/**
 * Each of these resolves with the grant **as it stands afterwards**, so the
 * caller can treat all three identically. A `false` means the driver said no,
 * or was sent to a settings screen and hasn't answered yet — never an error.
 */
export function requestDriverPermission(
  permission: DriverPermission,
): Promise<boolean> {
  switch (permission) {
    case 'backgroundLocation':
      return requestBackgroundLocation();
    case 'notifications':
      return requestNotifications();
    case 'overlay':
      return ask(module => module.requestOverlay());
    case 'battery':
      return ask(module => module.requestIgnoreBatteryOptimizations());
  }
}

/**
 * The one grant here that is still an ordinary dialog on every version that has
 * it — with the one catch that Android stops showing that dialog after two
 * refusals and answers `never_ask_again` without the driver seeing anything.
 * A button that visibly does nothing is worse than no button, so that case
 * hands over to the settings app instead.
 */
async function requestNotifications(): Promise<boolean> {
  if (await hasNotifications()) {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    await Linking.openSettings();
    return false;
  }
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * From Android 11 the "Allow all the time" option was taken out of the runtime
 * dialog altogether — the only place to grant it is the app's own settings
 * page. So on those versions this opens settings and comes back `false`; the
 * grant is picked up when the app returns to the foreground and the status is
 * re-read.
 *
 * Callers must already hold foreground location: Android ignores a background
 * request from an app that doesn't, and would burn one of the driver's two
 * refusals doing it. `useDuty` only reaches here after it has a fix.
 */
async function requestBackgroundLocation(): Promise<boolean> {
  if (await hasBackgroundLocation()) {
    return true;
  }

  if (backgroundLocationNeedsSettings()) {
    await Linking.openSettings();
    return false;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Whether granting background location means a trip to the settings app rather
 * than a dialog — the UI labels its button differently, because "Allow" that
 * throws you out of the app and into Settings is a small lie.
 */
export function backgroundLocationNeedsSettings(): boolean {
  return androidApi() >= ANDROID_11;
}

/** The app's own page in Settings, for a driver who refused once too often. */
export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}

/* ------------------------------------------------ plumbing */

/**
 * Before Android 13 an app could post without asking, so there is no permission
 * to check and this reports `true`. That is not the same as the driver actually
 * seeing anything — notifications can still be switched off per app in Settings
 * on every version — but nothing in `PermissionsAndroid` can see that, and a row
 * offering to fix something it cannot detect or change would never clear.
 */
async function hasNotifications(): Promise<boolean> {
  if (androidApi() < ANDROID_13) {
    return true;
  }
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  } catch {
    return false;
  }
}

async function hasBackgroundLocation(): Promise<boolean> {
  // Before Android 10 there was no separate grant: foreground location kept
  // working in the background, and the check below would report `false` for a
  // permission the device has never heard of.
  if (androidApi() < ANDROID_10) {
    return true;
  }
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    );
  } catch {
    return false;
  }
}

/**
 * Calls into the native module, treating "no module" as "granted".
 *
 * The module is Android-only and registered by the app itself, so it is absent
 * on iOS and in Jest. Neither of those has an overlay or a battery whitelist to
 * begin with, and reporting a grant the platform doesn't have as *missing*
 * would put a sheet in front of the driver that no button on it can clear.
 */
async function ask(
  call: (module: NonNullable<typeof NativeDriverPermissions>) => Promise<boolean>,
): Promise<boolean> {
  if (!NativeDriverPermissions) {
    return true;
  }
  try {
    return await call(NativeDriverPermissions);
  } catch (error) {
    if (__DEV__) {
      console.warn('[permissions] native call failed —', error);
    }
    return false;
  }
}