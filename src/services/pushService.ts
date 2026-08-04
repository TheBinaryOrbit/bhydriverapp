import { Platform } from 'react-native';
import {
  getMessaging,
  getToken,
  registerDeviceForRemoteMessages,
} from '@react-native-firebase/messaging';

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
