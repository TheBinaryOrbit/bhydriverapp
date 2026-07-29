import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { CARD_SHADOW } from '../profile/MenuSection';
import type { DutyBlock } from '../../hooks/useQuickRide';
import type { LinkStatus } from '../../services/driverSocket';
import { colors, navyGradient } from '../../theme/colors';

type Props = {
  onDuty: boolean;
  switching: boolean;
  link: LinkStatus;
  onGoOnline: () => void;
  onGoOffline: () => void;
};

/**
 * The on/off switch for dispatch, and the honest read on the connection.
 *
 * A dropped socket does **not** mean the driver is offline: the server parks
 * their place in the geo index for five minutes. So `reconnecting` gets its own
 * amber state rather than flipping the switch back.
 */
export default function DutyPanel({
  onDuty,
  switching,
  link,
  onGoOnline,
  onGoOffline,
}: Props) {
  const { t } = useTranslation();

  const reconnecting = onDuty && link === 'reconnecting';
  const live = onDuty && link === 'connected';

  return (
    <LinearGradient
      colors={navyGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: 20 }, CARD_SHADOW]}
    >
      <View className="flex-row items-center p-5">
        <View className="flex-1">
          <View className="flex-row items-center">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: reconnecting
                  ? '#ffb020'
                  : live
                    ? '#3ddc84'
                    : 'rgba(255,255,255,0.4)',
              }}
            />
            <Text className="ml-2 text-base font-extrabold text-white">
              {reconnecting
                ? t('quickRide.reconnecting')
                : live
                  ? t('quickRide.online')
                  : t('quickRide.offline')}
            </Text>
          </View>

          <Text className="mt-1 text-[13px] leading-5 text-white/70">
            {reconnecting
              ? t('quickRide.reconnectingBody')
              : live
                ? t('quickRide.onlineBody')
                : t('quickRide.offlineBody')}
          </Text>
        </View>

        <Pressable
          onPress={onDuty ? onGoOffline : onGoOnline}
          disabled={switching}
          className={`ml-4 h-12 min-w-[104px] flex-row items-center justify-center rounded-full px-5 ${
            switching ? 'opacity-70' : 'active:opacity-85'
          }`}
          style={{
            backgroundColor: onDuty ? 'rgba(255,255,255,0.16)' : colors.tertiary,
          }}
        >
          {switching ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <>
              <MaterialIcons
                name={onDuty ? 'pause' : 'bolt'}
                size={17}
                color={colors.primary}
              />
              <Text className="ml-1.5 text-sm font-bold text-white">
                {onDuty ? t('quickRide.goOffline') : t('quickRide.goOnline')}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </LinearGradient>
  );
}

/**
 * Why the driver couldn't go on duty, with the one action that clears it.
 * `driver:online` reports KYC and vehicle gaps through its ack, and both are
 * fixable from inside the app — so they get a button, not just a sentence.
 */
export function DutyBlockNote({
  block,
  onAction,
  onRetry,
}: {
  block: DutyBlock;
  /** Opens KYC or the vehicle form. Absent for the transient kinds. */
  onAction: (kind: 'kyc' | 'vehicle') => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  const COPY: Record<
    DutyBlock['kind'],
    { icon: string; title: string; body: string; cta?: string }
  > = {
    kyc: {
      icon: 'gpp-maybe',
      title: t('quickRide.blockKycTitle'),
      body: t('quickRide.blockKycBody'),
      cta: t('quickRide.blockKycCta'),
    },
    vehicle: {
      icon: 'directions-car',
      title: t('quickRide.blockVehicleTitle'),
      body: t('quickRide.blockVehicleBody'),
      cta: t('quickRide.blockVehicleCta'),
    },
    location: {
      icon: 'location-off',
      title: t('quickRide.blockLocationTitle'),
      body: t('quickRide.blockLocationBody'),
      cta: t('quickRide.retry'),
    },
    connection: {
      icon: 'wifi-off',
      title: t('quickRide.blockConnectionTitle'),
      body: t('quickRide.blockConnectionBody'),
      cta: t('quickRide.retry'),
    },
    unknown: {
      icon: 'error-outline',
      title: t('quickRide.blockUnknownTitle'),
      body: block.message ?? t('quickRide.blockUnknownBody'),
      cta: t('quickRide.retry'),
    },
  };

  const copy = COPY[block.kind];
  const actionable = block.kind === 'kyc' || block.kind === 'vehicle';

  return (
    <View
      className="mt-4 rounded-2xl border p-4"
      style={{
        borderColor: colors.warningSurface,
        backgroundColor: colors.warningSurface,
      }}
    >
      <View className="flex-row items-start">
        <MaterialIcons name={copy.icon} size={18} color={colors.warning} />
        <View className="ml-2.5 flex-1">
          <Text className="text-[13px] font-bold" style={{ color: colors.warning }}>
            {copy.title}
          </Text>
          <Text className="mt-1 text-xs leading-5" style={{ color: colors.warning }}>
            {copy.body}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() =>
          actionable ? onAction(block.kind as 'kyc' | 'vehicle') : onRetry()
        }
        className="mt-3 items-center rounded-xl py-3 active:opacity-85"
        style={{ backgroundColor: colors.warning }}
      >
        <Text className="text-sm font-bold text-white">{copy.cta}</Text>
      </Pressable>
    </View>
  );
}
