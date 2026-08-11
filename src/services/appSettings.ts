import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API, apiUrl } from './api';
import NativeAppInfo from '../specs/NativeAppInfo';

/**
 * Boot configuration — `GET /settings/:type`, see `docs/app-settings.md`.
 *
 * One unauthenticated call carrying three unrelated things the app cannot work
 * out for itself: the build the store is on, where the "how to register" video
 * lives, and whatever an admin wants said on the home screen today.
 *
 * **Nothing here is allowed to fail loudly.** Every read resolves rather than
 * throws, and every consumer treats `null` as "carry on as before": a driver
 * whose network dropped must still be able to work, and a settings row that has
 * not been created yet (`404`) is the normal state of a fresh environment, not
 * an error worth showing anyone.
 *
 * There is no push for this — no socket event, no notification — so the app only
 * learns about a raised build number the next time it asks. Hence the two read
 * points in `useAppSettings`: cold start, and every return to the foreground.
 */

export type PromotionalBanner = {
  _id: string;
  title?: string;
  imageUrl: string;
  linkUrl?: string;
  order?: number;
};

export type AppSettings = {
  type?: 'android' | 'ios';
  /** Display string only — `"3.10.0" < "3.9.0"` as text, so never compared. */
  appVersion?: string;
  /** The store's monotonic integer. The only field the gate compares. */
  appBuildNumber?: number;
  isUpdateMandatory?: boolean;
  /** The registration walkthrough. May be an empty string — then hide the link. */
  onboardingLink?: string;
  /** Raw admin-authored HTML for the home screen. May be an empty string. */
  homePageContent?: string;
  /** Rider-app banners. Present in the payload; this app has no use for them. */
  userPromotionalBanners?: PromotionalBanner[];
  updatedAt?: string;
};

/** What the update gate decided, once. */
export type UpdateCheck = {
  /** The store build is ahead of this one. */
  available: boolean;
  /** …and the driver is not allowed past it. */
  mandatory: boolean;
  /** For the copy — "Version 1.2.0 is available". */
  version?: string;
};

const CACHE_KEY = 'bhy.appSettings.v1';

/** The last good copy, for callers that arrive after the first fetch. */
let current: AppSettings | null = null;
/** De-dupes concurrent callers — the home screen and the KYC screen overlap. */
let inFlight: Promise<AppSettings | null> | null = null;

/** Whatever we know right now, without waiting for anything. */
export function currentAppSettings(): AppSettings | null {
  return current;
}

/**
 * The settings for this platform. Resolves `null` when the call fails and
 * nothing was cached — never rejects.
 *
 * The cached copy is adopted first so a screen opening offline still gets the
 * onboarding link it had yesterday; the network copy replaces it when it lands.
 */
export async function fetchAppSettings(): Promise<AppSettings | null> {
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    if (!current) {
      current = await readCache();
    }

    try {
      const type = Platform.OS === 'ios' ? 'ios' : 'android';
      const res = await fetch(apiUrl(`${API.endpoints.settings}/${type}`));
      if (!res.ok) {
        // `404` is a platform with no settings row yet — a real state of a fresh
        // backend, and no reason to drop the copy we already have.
        return current;
      }

      const data = (await res.json()) as AppSettings | null;
      if (data && typeof data === 'object') {
        current = data;
        writeCache(data);
      }
      return current;
    } catch {
      return current;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * This build's `versionCode`, or `null` on a platform that cannot say.
 *
 * `null` is not "build 0": it means the comparison cannot be made at all, and
 * the gate stays shut rather than guessing. That is the iOS path today — there
 * is no `AppInfo` module there — and it is the right answer for it, because
 * telling every iOS driver to update on the strength of a missing number would
 * be worse than telling none of them.
 */
export function localBuildNumber(): number | null {
  if (!NativeAppInfo) {
    return null;
  }
  try {
    const build = NativeAppInfo.getBuildNumber();
    return Number.isFinite(build) ? build : null;
  } catch {
    return null;
  }
}

/** This build's `versionName`, for logs and support screens. */
export function localVersion(): string | null {
  try {
    return NativeAppInfo?.getVersion() ?? null;
  } catch {
    return null;
  }
}

/**
 * Compares builds, never version strings — see the doc's own warning about
 * `"3.10.0" < "3.9.0"`.
 *
 * `isUpdateMandatory` is read *only* when the store build is genuinely ahead. A
 * phone already on the latest build ignores the flag, which is what stops a
 * forgotten `true` in the admin panel from locking out the whole fleet.
 */
export function checkForUpdate(
  settings: AppSettings | null,
  local = localBuildNumber(),
): UpdateCheck {
  const store = settings?.appBuildNumber;

  if (!settings || local === null || typeof store !== 'number' || store <= local) {
    return { available: false, mandatory: false, version: settings?.appVersion };
  }

  return {
    available: true,
    mandatory: settings.isUpdateMandatory === true,
    version: settings.appVersion,
  };
}

/** Where the update prompt sends the driver. */
export function storeUrl(): string {
  const id = packageName();
  // `market://` opens the Play app directly; the https form is what a phone
  // without it (or with the store disabled) can still handle.
  return `https://play.google.com/store/apps/details?id=${id}`;
}

/** The deep link tried first, so the Play app opens rather than a browser tab. */
export function storeDeepLink(): string {
  return `market://details?id=${packageName()}`;
}

function packageName(): string {
  try {
    return NativeAppInfo?.getPackageName() || 'com.xcentic.bhy';
  } catch {
    return 'com.xcentic.bhy';
  }
}

/** Empty strings mean "nothing to show" throughout this payload, not "missing". */
export function trimmed(value?: string): string | null {
  const text = value?.trim();
  return text ? text : null;
}

async function readCache(): Promise<AppSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppSettings) : null;
  } catch {
    return null;
  }
}

function writeCache(settings: AppSettings): void {
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(settings)).catch(() => {
    // A failed cache write must never break a boot.
  });
}
