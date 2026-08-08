import { Platform } from 'react-native';
import {
  getMessaging,
  getToken,
  onMessage,
  registerDeviceForRemoteMessages,
  setBackgroundMessageHandler,
  type RemoteMessage,
} from '@react-native-firebase/messaging';

import { offerPushedRide } from './rideDispatch';

/**
 * This device's FCM token, or `undefined` when one can't be obtained.
 *
 * Deliberately never throws. `/auth/verify` treats `fcmToken` as optional and
 * *keeps the token it already stored* when the field is missing (see
 * `docs/driver-auth-onboarding.md`) — so a device without Play Services, an
 * emulator, or a build whose Firebase config never made it in must still be
 * able to log in, and must not have a good token overwritten by a bad one.
 * That is also why the failure path returns `undefined` rather than `''`:
 * an empty string would be sent, and would wipe the stored token.
 */
export async function getFcmToken(): Promise<string | undefined> {
  try {
    const messaging = getMessaging();
    if (Platform.OS === 'ios') {
      // iOS has no FCM token until the app is registered with APNs.
      await registerDeviceForRemoteMessages(messaging);
    }
    const token = await getToken(messaging);
    return token || undefined;
  } catch (error) {
    if (__DEV__) {
      console.warn('[push] no FCM token —', error);
    }
    return undefined;
  }
}

/* ------------------------------------------------ receiving */

/**
 * Who draws a push, and when — the part that decides whether the driver sees
 * anything at all:
 *
 * | App state  | `notification` payload      | `data`-only payload |
 * | ---------- | --------------------------- | ------------------- |
 * | background | Android draws it, no JS runs | `onBackgroundEvent` |
 * | quit       | Android draws it, no JS runs | `onBackgroundEvent` |
 * | foreground | **nothing** — `onEvent` only | `onEvent`           |
 *
 * The two right-hand columns are the app's problem, and neither of them draws
 * anything by itself: Firebase hands the message to JS and stops there. Posting
 * a notification from JS needs a local-notification library (`@notifee/react-native`),
 * which this app does not have yet — so for now these handlers exist to make
 * delivery *visible*, and the driver is only served by the left-hand column.
 *
 * Silence in this log means the message never arrived: a stale `fcmToken` on
 * the account, a backend that sent to the rider's token, or no Play Services on
 * the device. Lines here with nothing on screen means it arrived and had
 * nowhere to go — check `POST_NOTIFICATIONS`, then the payload shape.
 */
export function registerForegroundPushHandler(): () => void {
  return onMessage(getMessaging(), async message => {
    logMessage('foreground', message);
  });
}

/**
 * Registered from `index.js`, not from a component.
 *
 * Firebase starts a headless JS task for a background data message, and that
 * task runs with no React tree mounted — a handler installed inside `App` would
 * not exist yet at the moment it is needed.
 */
export function registerBackgroundPushHandler(): void {
  setBackgroundMessageHandler(getMessaging(), async message => {
    logMessage('background', message);
    await handleRidePush(message);
  });
}

/**
 * The push a driver cannot afford to miss, turned into the overlay card.
 *
 * This is the path for a process that is **gone** — force-stopped, or killed by
 * an OEM battery manager that never restarted the service. There is no socket in
 * that context to carry a `ride:request`, so FCM is the only thing left that can
 * reach the driver, and Firebase gives it a headless JS runtime for about a
 * minute. `offerPushedRide` holds that runtime open until the card is answered.
 *
 * **This only runs for a data-only message.** A payload carrying a `notification`
 * block is drawn by Android itself and never reaches JS while the app is in the
 * background or quit — which is every case this function exists for. A ride push
 * that wants a card has to send its fields in `data` and leave `notification`
 * out; `android.priority: "high"` is right either way. See the field table on
 * `offerPushedRide` for what `data` needs to carry.
 */
async function handleRidePush(message: RemoteMessage): Promise<void> {
  // `type` is the only field to branch on; everything else about the payload is
  // free to change without this line moving.
  const data = message.data;
  if (data?.type !== 'quickride.new') {
    return;
  }
  await offerPushedRide(data as Record<string, string | undefined>);
}

function logMessage(where: string, message: RemoteMessage): void {
  if (__DEV__) {
    console.log(`[push] ${where}`, {
      // A message with no `notification` is data-only, which is the case the
      // system will never draw for us no matter what the driver has granted.
      notification: message.notification ?? null,
      data: message.data ?? null,
    });
  }
}
