import { API, apiError, apiUrl, bearer } from './api';
import { fetchMe } from './driverService';
import type { Driver } from '../types/driver';

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
export async function startKyc(token: string): Promise<string> {
  // No body — the driver is taken from the token and a payload would be ignored.
  const res = await fetch(apiUrl(API.endpoints.kycVerify), {
    method: 'POST',
    headers: bearer(token),
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
 */
export function isKycRedirect(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  return API.kycRedirectUrls.some(target => url.startsWith(target));
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
