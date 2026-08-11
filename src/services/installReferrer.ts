import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PlayInstallReferrer,
  type PlayInstallReferrerInfo,
} from 'react-native-play-install-referrer';

import { API, apiUrl, bearer } from './api';
import { localVersion } from './appSettings';
import { getDeviceId } from '../storage/deviceStorage';

/**
 * Where this install came from, recorded on **our** backend —
 * `docs/install-attribution.md`.
 *
 * Google Play hands every install a referrer string the store link carried
 * (`utm_source=whatsapp&utm_campaign=launch`, and whatever Meta attaches to an
 * ad click). It is available exactly once, from the Play Store app, and only on
 * Android. Posting it gives us the one number Ads Manager cannot: how many
 * installs from each source went on to become drivers.
 *
 * The Meta SDK (`metaEvents.ts`) is the other half and is entirely separate —
 * it reports to Meta, this reports to us, and it only ever sees Meta's own
 * installs.
 *
 * Nothing here throws and nothing here blocks anything the driver is doing. The
 * data is marketing signal: worth having, never worth a failed signup.
 */

/** Set once the install has been recorded — or refused for good. */
const SENT_KEY = '@bhy/installReferrerSent';

/** Set once the signup has been tied to that install. */
const LINKED_KEY = '@bhy/installReferrerLinked';

/**
 * Neither key belongs to the session. `clearSession` wipes what it owns on
 * sign-out, and re-posting an install because a driver signed out would be a
 * second row for one install — or worse, a second *signup* counted against the
 * campaign.
 */
const SUPPORTED = Platform.OS === 'android';

/**
 * Records the install, once per device, on the first launch that manages it.
 *
 * Safe to call on every launch: it returns immediately once the flag is set,
 * and the server treats a repeat post as a `200` rather than an error, so even
 * a lost flag cannot produce a second row or overwrite the referrer already
 * stored. The *first* referrer is the one that explains the install.
 */
export async function reportInstallReferrer(): Promise<void> {
  if (!SUPPORTED) {
    // The Play Install Referrer API does not exist off Android.
    return;
  }

  try {
    if (await AsyncStorage.getItem(SENT_KEY)) {
      return;
    }

    const info = await readReferrer();
    if (!info?.installReferrer) {
      // No referrer yet, or Play refused to answer. Leave the flag unset and
      // try again next launch rather than recording a blank.
      return;
    }

    const response = await fetch(apiUrl(API.endpoints.installReferrers), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referrer: info.installReferrer,
        // Required by the API, so it falls back to now rather than being
        // dropped — an install whose own timestamp is unreadable is still an
        // install, and this call is happening on the launch that followed it.
        install_time:
          seconds(info.installBeginTimestampSeconds) ??
          Math.floor(Date.now() / 1000),
        referrer_click_time: seconds(info.referrerClickTimestampSeconds),
        device_id: await getDeviceId(),
        app: 'driver',
        platform: 'android',
        app_version: localVersion() ?? undefined,
      }),
    });

    // `201` recorded, `200` already had it — both are done. So is a `400`: the
    // referrer we hold is the only one this device will ever have, and posting
    // it again next launch would be the same rejection forever.
    if (response.status < 500) {
      await AsyncStorage.setItem(SENT_KEY, '1');
    }
  } catch (error) {
    // A dropped connection. The flag stays unset and the next launch retries.
    if (__DEV__) {
      console.warn('[install] referrer not reported —', error);
    }
  }
}

/**
 * Ties the install to the account that was just created on it.
 *
 * Called once, when `/drivers/onboard` succeeds. The account comes from the
 * token and never from the body — this only says *which device* signed up.
 * Without it every install stays unattributed to a driver, and the `signups`
 * column of the report is zero however many accounts are created.
 */
export async function linkInstallToAccount(token: string): Promise<void> {
  if (!SUPPORTED || !token) {
    return;
  }

  try {
    if (await AsyncStorage.getItem(LINKED_KEY)) {
      return;
    }

    // The row has to exist before it can be linked, and a driver who installed
    // and signed up inside one launch may have raced the post above — or found
    // it failed. Cheap when it is already done, which is the normal case.
    await reportInstallReferrer();

    const response = await fetch(
      `${apiUrl(API.endpoints.installReferrers)}/link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(token) },
        body: JSON.stringify({ device_id: await getDeviceId() }),
      },
    );

    // `{ linked: false }` is a `200` too — no row for this device, which is
    // simply what an install from before this feature looks like. Nothing about
    // it improves by asking again.
    if (response.status < 500) {
      await AsyncStorage.setItem(LINKED_KEY, '1');
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[install] signup not linked —', error);
    }
  }
}

/* ------------------------------------------------ internals */

/**
 * The Play referrer, or `null` for any reason it could not be read — no Play
 * Store on the device, an install that predates the API, or the service simply
 * declining to connect. All of those are ordinary, not errors.
 *
 * Wrapped because the library is callback-based and this needs to be awaited
 * alongside two AsyncStorage reads.
 */
function readReferrer(): Promise<PlayInstallReferrerInfo | null> {
  return new Promise(resolve => {
    try {
      PlayInstallReferrer.getInstallReferrerInfo((info, error) => {
        resolve(error ? null : info);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * UNIX seconds from what the library hands back as a *string* — every timestamp
 * in `PlayInstallReferrerInfo` is one. `undefined` for anything unparseable,
 * which the API is happy to receive for an optional field and the caller
 * substitutes for the required one.
 */
function seconds(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
