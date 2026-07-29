import { Linking, Platform } from 'react-native';

import type { LatLng } from '../types/quickRide';

/**
 * Hands a destination to the phone's navigation app.
 *
 * Always coordinates, never `pickupLocationName` — the name is a display label
 * the rider typed or picked and is routinely ambiguous.
 */
export async function navigateTo(target: LatLng): Promise<boolean> {
  const { lat, lng } = target;

  const native =
    Platform.OS === 'android'
      ? `google.navigation:q=${lat},${lng}&mode=d`
      : `maps://?daddr=${lat},${lng}&dirflg=d`;

  // Opens the installed Maps app on both platforms, and the web map if there
  // isn't one — so it is a real fallback, not a second chance at the same thing.
  const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  try {
    if (await Linking.canOpenURL(native)) {
      await Linking.openURL(native);
      return true;
    }
  } catch {
    // Fall through — a refused `canOpenURL` is not worth surfacing.
  }

  try {
    await Linking.openURL(web);
    return true;
  } catch {
    return false;
  }
}

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
