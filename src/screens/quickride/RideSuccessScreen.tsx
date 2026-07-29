import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import PrimaryButton from '../../components/PrimaryButton';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import CollectPaymentQr from '../../components/quickride/CollectPaymentQr';
import { rupees } from '../../components/quickride/format';
import { useAuth } from '../../hooks/useAuth';
import type { RootStackParamList } from '../../navigation/types';
import { fetchMyPaymentDetails } from '../../services/paymentService';
import { colors } from '../../theme/colors';
import { upiIdOf } from '../../utils/upi';

type Props = NativeStackScreenProps<RootStackParamList, 'RideSuccess'>;

/**
 * Trip closed. Completing is also what frees the driver, so "Done" goes back to
 * the home tab where `ride:request` events are already arriving again.
 *
 * The fare is collected here: the driver holds up the UPI QR and the rider
 * scans it, which is why the screen refuses to leave the amount out.
 */
export default function RideSuccessScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { token, driver } = useAuth();

  const { rideId, finalFare, completedAt, dropLocationName, paymentDetails } =
    route.params;

  // The completion response carries the payee block; the `ride:completed`
  // socket path does not, so that case falls back to the driver's own record.
  const [upiId, setUpiId] = useState<string | null>(() =>
    upiIdOf(paymentDetails),
  );
  const [loadingUpi, setLoadingUpi] = useState(!upiIdOf(paymentDetails));

  useEffect(() => {
    if (upiId) {
      return;
    }
    if (!token) {
      // Still resolving the session — keep the placeholder up.
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const details = await fetchMyPaymentDetails(token);
        if (!cancelled) {
          setUpiId(upiIdOf(details));
        }
      } catch {
        // A driver with no reachable UPI id just sees the empty state; this
        // screen must never fail on the way out of a finished ride.
        if (!cancelled) {
          setUpiId(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingUpi(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, upiId]);

  // Reset rather than pop: the details screen behind this one belongs to a ride
  // that no longer exists, and a back swipe must not reach it.
  const done = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [navigation]);

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.successSurface }}
        >
          <MaterialIcons name="check-circle" size={52} color={colors.success} />
        </View>

        <Text className="mt-6 text-2xl font-extrabold text-secondary">
          {t('rideSuccess.title')}
        </Text>
        <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
          {t('rideSuccess.body')}
        </Text>

        <View
          className="mt-8 w-full items-center rounded-2xl border border-border bg-white px-6 py-6"
          style={CARD_SHADOW}
        >
          <Text className="text-xs font-bold uppercase tracking-wide text-muted">
            {t('rideSuccess.earned')}
          </Text>
          <Text className="mt-1 text-[40px] font-extrabold leading-[46px] text-secondary">
            {rupees(finalFare)}
          </Text>

          {dropLocationName ? (
            <View className="mt-4 w-full flex-row items-start border-t border-border pt-4">
              <MaterialIcons
                name="place"
                size={16}
                color={colors.tertiary}
                style={{ marginTop: 1 }}
              />
              <Text className="ml-2 flex-1 text-[13px] font-semibold text-secondary">
                {dropLocationName}
              </Text>
            </View>
          ) : null}

          {completedAt ? (
            <Text className="mt-3 text-xs text-muted">
              {t('rideSuccess.at', { time: formatTime(completedAt) })}
            </Text>
          ) : null}
        </View>

        <CollectPaymentQr
          upiId={upiId}
          amount={finalFare}
          payeeName={driver?.name}
          reference={rideId}
          note={dropLocationName}
          loading={loadingUpi && !upiId}
        />
      </ScrollView>

      <View className="px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <PrimaryButton
          label={t('rideSuccess.done')}
          icon="home"
          onPress={done}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Centred while the content is short, scrollable once the QR pushes past. */
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
});

/** `29 Jul, 4:12 pm` — the device locale decides the exact wording. */
function formatTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  return at.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
