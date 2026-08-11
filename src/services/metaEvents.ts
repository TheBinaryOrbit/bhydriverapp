import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';

/**
 * The Meta SDK, which reports installs and app events to Ads Manager.
 *
 * This is one of the two halves of install attribution, and the one that only
 * Meta ever sees: it tells Meta that an ad produced an install, which is what
 * their optimiser needs to spend the budget on people who actually install.
 * What it cannot tell *us* is where a non-Meta install came from, or which
 * installs became drivers — that is `installReferrer.ts`, and the two do not
 * depend on each other.
 *
 * The app id and client token are manifest resources, read by the SDK as the
 * process starts; nothing here passes them in. The **App Secret is not in the
 * app at all** and must never be — it is a server-side credential.
 *
 * Every function here swallows its own failures. Attribution is telemetry: a
 * driver whose signup is going through must never see it fail, and must never
 * fail *because of* it.
 */

/**
 * Called once, as the app starts.
 *
 * `setAdvertiserTrackingEnabled` is the switch attribution actually hangs on —
 * without it the SDK collects the events and Meta declines to attribute them.
 * It is nominally an iOS/ATT flag and harmless on Android, which is the only
 * platform this app ships to; it is set here so the call is already in place if
 * that changes.
 */
export function initMetaSdk(): void {
  try {
    Settings.initializeSDK();
    Settings.setAdvertiserTrackingEnabled(true);
    Settings.setAutoLogAppEventsEnabled(true);
  } catch (error) {
    if (__DEV__) {
      console.warn('[meta] SDK did not initialise —', error);
    }
  }
}

/**
 * The one event this app logs by hand. Installs and app-opens are auto-logged
 * by the SDK; there is no purchase event because nothing in the driver app
 * takes a payment.
 *
 * Fired when `/drivers/onboard` succeeds — the moment the account exists —
 * rather than when the driver starts the form, so the number in Ads Manager is
 * accounts and not attempts.
 */
export function logSignupCompleted(): void {
  try {
    AppEventsLogger.logEvent('CompleteRegistration');
  } catch (error) {
    if (__DEV__) {
      console.warn('[meta] CompleteRegistration not logged —', error);
    }
  }
}
