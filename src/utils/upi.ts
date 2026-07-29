/**
 * UPI collect links — what the rider scans at the end of a ride.
 *
 * The payload has to be exactly NPCI's `upi://pay` deep link: a UPI app that
 * doesn't recognise the scheme falls back to showing the QR as plain text, so
 * a malformed link fails silently rather than loudly. Everything here is
 * built for **one** direction: the rider pays the driver's saved UPI id.
 */

import { isValidUpiId } from '../services/paymentService';
import type { PaymentDetails, RidePaymentDetails } from '../types/driver';

/**
 * The driver's collection VPA, or `null` when there isn't a usable one.
 *
 * Two spellings arrive from the API — `upi` on a ride's `paymentDetails`,
 * `upiId` on `/payment-details` — and an id that fails the format check is
 * treated as missing, because a QR built from it would scan as garbage.
 */
export function upiIdOf(
  details?: RidePaymentDetails | PaymentDetails | null,
): string | null {
  const raw = (details as RidePaymentDetails | null)?.upi ?? details?.upiId;
  const trimmed = raw?.trim();
  return trimmed && isValidUpiId(trimmed) ? trimmed : null;
}

export type UpiCollectRequest = {
  /** Payee VPA — already validated, e.g. by `upiIdOf`. */
  upiId: string;
  /** Payee name shown in the rider's UPI app before they confirm. */
  payeeName?: string;
  /** Rupees. Left out when absent or non-positive, so the rider types it. */
  amount?: number | null;
  /** Reconciliation reference — the ride id. Alphanumeric only, per NPCI. */
  reference?: string;
  /** Free-text line on the payment, e.g. the ride's drop location. */
  note?: string;
};

/**
 * `upi://pay?pa=…&pn=…&am=…&cu=INR` — the string that goes into the QR.
 *
 * `am` is fixed at two decimals with no separators or symbol; anything else
 * (`₹1,250`) makes apps drop the amount and prompt for it instead.
 */
export function upiPaymentUrl({
  upiId,
  payeeName,
  amount,
  reference,
  note,
}: UpiCollectRequest): string {
  // `pa` is left unescaped: the id already passed `UPI_PATTERN`, so it holds
  // nothing that needs encoding, and some apps mis-handle a `%40` here.
  const params = [`pa=${upiId}`, 'cu=INR'];

  if (payeeName?.trim()) {
    params.push(`pn=${encodeURIComponent(payeeName.trim())}`);
  }
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
    params.push(`am=${amount.toFixed(2)}`);
  }
  if (reference) {
    const clean = reference.replace(/[^a-zA-Z0-9]/g, '');
    if (clean) {
      params.push(`tr=${clean}`);
    }
  }
  if (note?.trim()) {
    params.push(`tn=${encodeURIComponent(note.trim().slice(0, 50))}`);
  }

  return `upi://pay?${params.join('&')}`;
}
