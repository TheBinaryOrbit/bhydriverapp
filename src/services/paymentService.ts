import { API, apiError, apiUrl, bearer } from './api';
import type { PaymentDetails } from '../types/driver';

/** Server pattern: handle, `@`, letters-only bank suffix. */
export const UPI_PATTERN = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

export function isValidUpiId(upiId: string): boolean {
  return UPI_PATTERN.test(upiId.trim());
}

/**
 * The driver's saved UPI id, or `null` when they haven't added one —
 * the API's `404` here is an empty state, not an error.
 */
export async function fetchMyPaymentDetails(
  token: string,
): Promise<PaymentDetails | null> {
  const res = await fetch(apiUrl(API.endpoints.myPaymentDetails), {
    headers: bearer(token),
  });
  const data = await res.json().catch(() => null);

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load payment details');
  }
  return data;
}

/** Upsert — the same call adds the first UPI id and replaces an existing one. */
export async function savePaymentDetails(
  token: string,
  upiId: string,
): Promise<PaymentDetails> {
  const res = await fetch(apiUrl(API.endpoints.paymentDetails), {
    method: 'POST',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ upiId: upiId.trim() }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.upiId) {
    throw apiError(data, res.status, 'Failed to save payment details');
  }
  return data;
}
