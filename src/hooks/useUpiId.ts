import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  fetchMyPaymentDetails,
  isValidUpiId,
  savePaymentDetails,
} from '../services/paymentService';
import { cacheUpiId, getCachedUpiId } from '../storage/authStorage';

/**
 * The driver's payout UPI id, and whether they still need to give us one.
 *
 * **Cache first, network only if it's empty.** A UPI id changes when the driver
 * changes it and at no other time, so once one is known there is nothing to ask
 * the server about — the only reason to call `/payment-details/me` is that we
 * don't have one yet. That inverts the usual cache: a hit ends the story, a
 * miss is what triggers the fetch.
 *
 * `ManagePaymentScreen` writes the cache too, so an id edited there is the one
 * the home screen sees.
 */

export type UpiIdState = {
  upiId: string | null;
  /** Checked, and there is none — the home screen should ask for one. */
  missing: boolean;
  saving: boolean;
  /** Validation or save failure, for the prompt to show inline. */
  error: string | null;
  /** Returns true once it is saved, which is also what closes the prompt. */
  save: (next: string) => Promise<boolean>;
  clearError: () => void;
};

export function useUpiId(token: string | null): UpiIdState {
  const [upiId, setUpiId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { t } = useTranslation();

  // The lookup runs once per app run — `token` settling from null shouldn't
  // re-ask a question already answered.
  const asked = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await getCachedUpiId();
      if (cancelled) {
        return;
      }
      if (cached) {
        setUpiId(cached);
        return;
      }
      if (!token || asked.current) {
        return;
      }

      try {
        // A 404 is "no UPI id yet" — the service already returns null for it.
        const details = await fetchMyPaymentDetails(token);
        if (cancelled) {
          return;
        }
        const found = details?.upiId?.trim();
        if (found) {
          await cacheUpiId(found);
          setUpiId(found);
          return;
        }
        asked.current = true;
        setMissing(true);
      } catch {
        // Never block the home screen on this, and never open the prompt off a
        // failed read: "we couldn't ask" is not "you have no UPI id". A 401 is
        // the session's problem and is handled where the session is; anything
        // else simply means we try again next launch.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const save = useCallback(
    async (next: string): Promise<boolean> => {
      const trimmed = next.trim();
      if (!trimmed) {
        setError(t('payment.required'));
        return false;
      }
      if (!isValidUpiId(trimmed)) {
        setError(t('payment.invalid'));
        return false;
      }
      if (!token) {
        return false;
      }

      setSaving(true);
      setError(null);
      try {
        const details = await savePaymentDetails(token, trimmed);
        await cacheUpiId(details.upiId);
        setUpiId(details.upiId);
        setMissing(false);
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('payment.saveFailed'),
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [t, token],
  );

  const clearError = useCallback(() => setError(null), []);

  return { upiId, missing, saving, error, save, clearError };
}
