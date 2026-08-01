import { Linking, Platform } from 'react-native';

import type { LatLng } from '../types/quickRide';

/*
 * In-app guidance (see `NavigationScreen`) is the default, and the reason is
 * the OTP: on a leg that ends in a step the driver has to come back to the app
 * for, handing them to Google Maps means they miss it.
 *
 * `openExternalNavigation` is for the one leg where that reasoning doesn't
 * hold — see its own note.
 */

/**
 * Hands a destination to Google Maps for turn-by-turn driving directions.
 *
 * Used for the **outstation drop leg only**. That trip is hundreds of
 * kilometres with the rider already aboard, so the in-app SDK's reason to exist
 * is gone — there is no OTP left to come back for, only "Complete trip" at the
 * far end — and Google Maps is what drivers know, with live traffic, lane
 * guidance and offline maps for the stretches with no signal.
 *
 * Three URLs, most specific first:
 *  1. `google.navigation:` — Android only, drops straight into guidance.
 *  2. `comgooglemaps://` — iOS, opens Google Maps if it is installed.
 *  3. The `google.com/maps` universal link — always resolves: the app when it
 *     is installed and claims the link, the browser otherwise.
 *
 * `canOpenURL` is deliberately not used. It needs `<queries>` /
 * `LSApplicationQueriesSchemes` entries this app doesn't declare and would
 * report false for a scheme that in fact works, so the fallback is driven by
 * `openURL` actually rejecting.
 */
export async function openExternalNavigation(
  destination: LatLng,
  label?: string,
): Promise<boolean> {
  const { lat, lng } = destination;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  const at = `${lat},${lng}`;

  const candidates = [
    Platform.OS === 'android'
      ? `google.navigation:q=${at}&mode=d`
      : `comgooglemaps://?daddr=${at}&directionsmode=driving`,
    // Coordinates stay the destination even when there is a name: an address
    // string is re-geocoded by Maps and can land on a different point.
    `https://www.google.com/maps/dir/?api=1&destination=${at}${
      label ? `&destination_place_id=&query=${encodeURIComponent(label)}` : ''
    }&travelmode=driving&dir_action=navigate`,
  ];

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // No handler for this scheme — try the next, more universal, one.
    }
  }
  return false;
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
