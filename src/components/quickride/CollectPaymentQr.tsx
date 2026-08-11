import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { rupees } from './format';
import { colors } from '../../theme/colors';
import { upiPaymentUrl } from '../../utils/upi';

type Props = {
  /** The driver's collection VPA, already validated by `upiIdOf`. */
  upiId: string | null;
  /** What the rider owes — the fare the ride closed at. */
  amount?: number;
  /** Shown to the rider inside their UPI app before they confirm. */
  payeeName?: string;
  /** Ride id, sent as the UPI transaction reference for reconciliation. */
  reference?: string;
  note?: string;
  /** True while the UPI id is still being looked up. */
  loading?: boolean;
};

/**
 * The "collect the fare" QR on the success screen: the rider scans it and
 * their UPI app opens pre-filled with the driver's id and the exact amount.
 *
 * The amount is baked into the QR, so this must be rendered from `finalFare`
 * and never from `offeredFare` — anything else charges the rider the wrong
 * number with no chance to notice.
 */
export default function CollectPaymentQr({
  upiId,
  amount,
  payeeName,
  reference,
  note,
  loading = false,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  // Big enough to scan across a car seat, but never wider than the card.
  const size = Math.min(180, Math.max(150, width - 160));

  const payload = useMemo(
    () =>
      upiId
        ? upiPaymentUrl({ upiId, amount, payeeName, reference, note })
        : null,
    [amount, note, payeeName, reference, upiId],
  );

  if (loading) {
    return (
      <View
        className="mt-4 w-full items-center justify-center rounded-2xl border border-border bg-white py-10"
        style={{ minHeight: size }}
      >
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  // No saved UPI id — say so plainly rather than showing an unscannable box.
  if (!payload) {
    return (
      <View className="mt-4 w-full flex-row items-start rounded-2xl border border-border bg-surface px-4 py-4">
        <MaterialIcons name="qr-code-2" size={20} color={colors.muted} />
        <Text className="ml-3 flex-1 text-[13px] leading-5 text-muted">
          {t('rideSuccess.noUpi')}
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-4 w-full items-center rounded-2xl border border-border bg-white px-5 py-5">
      <Text className="text-xs font-bold uppercase tracking-wide text-muted">
        {t('rideSuccess.collectTitle')}
      </Text>
      <Text className="mt-1 text-center text-[13px] leading-5 text-secondary">
        {t('rideSuccess.collectBody', { amount: rupees(amount) })}
      </Text>

      {/* White quiet zone around the modules — scanners need the contrast. */}
      <View className="mt-4 rounded-xl bg-white p-3">
        <QRCode
          value={payload}
          size={size}
          color={colors.secondary}
          backgroundColor={colors.primary}
          ecl="M"
        />
      </View>

      <Text className="mt-4 text-[13px] font-bold text-secondary">{upiId}</Text>
      <Text className="mt-1 text-[11px] text-muted">
        {t('rideSuccess.collectHint')}
      </Text>
    </View>
  );
}
