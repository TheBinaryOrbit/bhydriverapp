import { API, apiError, apiUrl, bearer } from './api';
import { fetchMe } from './driverService';
import type { Driver, KycDetails } from '../types/driver';

/**
 * Aadhaar KYC via Signzy's DigiLocker flow — see `docs/driver-kyc.md`.
 *
 * Two callbacks exist in this flow and only one involves the app: Signzy POSTs
 * the result straight to our backend, and separately redirects the WebView to a
 * static URL. The redirect only says the driver *finished the screen*, so the
 * app has to confirm the outcome against `GET /drivers/me`.
 */

/**
 * Opens a DigiLocker session and returns its URL.
 *
 * Sessions are short-lived: request a fresh URL every time the driver taps the
 * button and open it immediately. Never cache or reuse one.
 */
export async function startKyc(
  token: string,
  phoneNumber: string,
): Promise<string> {
  const res = await fetch(apiUrl(API.endpoints.kycVerify), {
    method: 'POST',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.redirectUrl) {
    throw apiError(data, res.status, 'KYC provider did not return a URL');
  }
  return data.redirectUrl;
}

/**
 * True once the WebView lands on one of the backend's success/failure URLs.
 *
 * Both outcomes may resolve to the *same* URL, so this answers "is the driver
 * done with the provider's screens?" — not "did verification succeed?".
 *
 * Matching is on the **host**, not the raw string: the provider is free to add
 * a trailing slash, query string or `www.`, and a strict prefix test would miss
 * the landing and leave the WebView open forever. A configured URL that names a
 * path still has to match that path — a bare origin matches anywhere on it.
 */
export function isKycRedirect(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  const here = splitUrl(url);
  if (!here.host) {
    return false;
  }

  return API.kycRedirectUrls.some(target => {
    const want = splitUrl(target);
    if (!want.host || here.host !== want.host) {
      return false;
    }
    return (
      want.path === '' ||
      here.path === want.path ||
      here.path.startsWith(`${want.path}/`)
    );
  });
}

/** Host (no scheme, port, credentials or `www.`) and path, both normalised. */
function splitUrl(url: string): { host: string; path: string } {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/i.exec(url.trim());
  const authority = match?.[1] ?? '';
  const host = (authority.split('@').pop() ?? '')
    .split(':')[0]
    .toLowerCase()
    .replace(/^www\./, '');

  return { host, path: (match?.[2] ?? '').replace(/\/+$/, '') };
}

/** ~15s of checks in total, matching the provider's callback latency. */
const POLL_DELAYS = [0, 2000, 3000, 5000, 5000];

/**
 * Polls `GET /drivers/me` until KYC lands, because the WebView redirect and
 * Signzy's server-to-server callback race each other — checking once, straight
 * away, routinely reports `false` for a KYC that succeeded moments later.
 *
 * Returns the last profile read. A result that is still not `isKycCompleted`
 * means *pending*, not failed: the callback may simply not have arrived yet.
 * `onDriver` fires on every successful read so the UI can update as it goes.
 */
export async function pollKycStatus(
  token: string,
  onDriver?: (driver: Driver) => void,
): Promise<Driver | null> {
  let latest: Driver | null = null;

  for (const wait of POLL_DELAYS) {
    if (wait) {
      await delay(wait);
    }
    try {
      latest = await fetchMe(token);
      onDriver?.(latest);
      if (latest.isKycCompleted) {
        return latest;
      }
    } catch {
      // A transient read failure shouldn't abandon the remaining attempts.
    }
  }

  return latest;
}

/* ------------------------------------------------------------------ *
 * Pre-signup KYC — keyed by phone number
 *
 * A driver whose OTP checks out but who has no account yet does KYC first,
 * so none of the calls below can carry a token: the phone number that was
 * just OTP-verified is the identity. The backend creates the driver record
 * from Signzy's callback, which is why "no driver yet" is an ordinary state
 * here rather than an error.
 * ------------------------------------------------------------------ */

export type PhoneKycStatus = {
  /** False while the backend has no driver row for this number yet. */
  found: boolean;
  driverId?: string;
  isKycCompleted: boolean;
  kycDetails?: KycDetails;
  kycFailedReason?: string | null;
  /** Session token, issued once the driver record exists. */
  token?: string;
};

const NOT_FOUND: PhoneKycStatus = { found: false, isKycCompleted: false };

/** Opens a DigiLocker session for a phone number that has no account yet. */
export async function startKycByPhone(phoneNumber: string): Promise<string> {
  const res = await fetch(apiUrl(API.endpoints.kycVerify), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.redirectUrl) {
    throw apiError(data, res.status, 'KYC provider did not return a URL');
  }
  return data.redirectUrl;
}

/**
 * Reads `GET /kyc/status/:phoneNumber`.
 *
 * `kycStatus: 'not_found'` means the callback hasn't landed yet — it comes
 * back as `found: false`, never as a throw, so callers can keep waiting.
 */
export async function fetchKycStatusByPhone(
  phoneNumber: string,
): Promise<PhoneKycStatus> {
  const res = await fetch(
    apiUrl(
      `${API.endpoints.kycStatusByPhone}/${encodeURIComponent(phoneNumber)}`,
    ),
  );

  const data = await res.json().catch(() => null);
  // The backend may signal "no driver" with either the body flag or a 404.
  if (res.status === 404 || data?.kycStatus === 'not_found') {
    return NOT_FOUND;
  }
  if (!res.ok || !data) {
    throw apiError(data, res.status, 'Could not read the KYC status');
  }

  return {
    found: true,
    driverId: data.driverId,
    isKycCompleted: data.isKycCompleted === true,
    kycDetails: data.kycDetails ?? undefined,
    kycFailedReason: data.kycFailedReason ?? null,
    token: data.token ?? undefined,
  };
}

/**
 * True once the backend has a final answer. Anything else — including a driver
 * row that exists but has neither flag set — is still in flight.
 */
export function isKycSettled(status: PhoneKycStatus): boolean {
  return status.isKycCompleted || Boolean(status.kycFailedReason?.trim());
}

/** Length of the confirmation window the screen counts down. */
export const PHONE_CONFIRM_SECONDS = 10;

/** t=0, +5s, +5s — fills `PHONE_CONFIRM_SECONDS` exactly. */
const PHONE_POLL_DELAYS = [0, 5000, 5000];

/**
 * Polls the phone-keyed status for the confirmation window, for the same reason
 * `pollKycStatus` exists: the WebView redirect races Signzy's server-to-server
 * callback, so the first read routinely reports nothing at all.
 *
 * Returns the last status read — `null` if every attempt failed. A result that
 * isn't `isKycSettled` means *still processing*, not failed.
 */
export async function pollKycStatusByPhone(
  phoneNumber: string,
  onStatus?: (status: PhoneKycStatus) => void,
): Promise<PhoneKycStatus | null> {
  let latest: PhoneKycStatus | null = null;

  for (const wait of PHONE_POLL_DELAYS) {
    if (wait) {
      await delay(wait);
    }
    try {
      latest = await fetchKycStatusByPhone(phoneNumber);
      onStatus?.(latest);
      if (isKycSettled(latest)) {
        return latest;
      }
    } catch {
      // A transient read failure shouldn't abandon the remaining attempts.
    }
  }

  return latest;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
