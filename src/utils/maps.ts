import { Linking } from 'react-native';

/*
 * Deliberately no `navigateTo` here. Guidance runs in-app on the Navigation SDK
 * (see `NavigationScreen`); handing a leg to the phone's Maps app would take the
 * driver away from the OTP and complete-ride steps, so failures stay on-screen.
 */

/** Dials the rider. Android may still show the dialler rather than calling. */
export async function callNumber(phoneNumber?: string): Promise<boolean> {
  if (!phoneNumber) {
    return false;
  }
  try {
    await Linking.openURL(`tel:${phoneNumber.replace(/\s+/g, '')}`);
    return true;
  } catch {
    return false;
  }
}
