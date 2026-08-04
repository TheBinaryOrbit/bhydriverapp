import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { CARD_SHADOW } from '../profile/MenuSection';
import type { DutyBlock } from '../../hooks/useDuty';
import type { LinkStatus } from '../../services/driverSocket';
import { colors, navyGradient } from '../../theme/colors';

/** The three duty tints, shared by the mark and the switch track. */
const TRACK_OFF = 'rgba(255,255,255,0.18)';
const TRACK_LIVE = '#3ddc84';
const TRACK_WARN = '#ffb020';

type Props = {
  onDuty: boolean;
  switching: boolean;
  link: LinkStatus;
  /** A ride is running, so duty is held on and the switch is inert. */
  locked?: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
};

/** Icon and tint per duty state — the state is read at a glance, not parsed. */
const STATE_MARK = {
  dutyLocked: { icon: 'local-taxi', tone: colors.primary },
  reconnecting: { icon: 'sync', tone: TRACK_WARN },
  online: { icon: 'bolt', tone: TRACK_LIVE },
  offline: { icon: 'power-settings-new', tone: 'rgba(255,255,255,0.55)' },
} as const;

/**
 * The on/off switch for dispatch, and the honest read on the connection.
 *
 * One line: mark, state, switch. It sits at the top of the home tab above the
 * ride cards, and every row it takes is a row of work the driver can't see —
 * the sentence of explanation it used to carry said nothing the state word and
 * the switch don't already say.
 *
 * A dropped socket does **not** mean the driver is offline: the server parks
 * their place in the geo index for five minutes. So `reconnecting` gets its own
 * amber state rather than flipping the switch back.
 */
export default function DutyPanel({
  onDuty,
  switching,
  link,
  locked = false,
  onGoOnline,
  onGoOffline,
}: Props) {
  const { t } = useTranslation();

  const reconnecting = onDuty && link === 'reconnecting';
  const live = onDuty && link === 'connected';
  const frozen = switching || locked;

  // `dutyLocked` / `online` / `offline` / `reconnecting` are also the i18n keys.
  const state = locked
    ? 'dutyLocked'
    : reconnecting
      ? 'reconnecting'
      : live
        ? 'online'
        : 'offline';
  const mark = STATE_MARK[state];

  return (
    <LinearGradient
      colors={navyGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: 20 }, CARD_SHADOW]}
    >
      <View className="flex-row items-center px-4 py-3.5">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
        >
          <MaterialIcons name={mark.icon} size={21} color={mark.tone} />
        </View>

        <Text
          className="ml-3 flex-1 text-[15px] font-extrabold text-white"
          numberOfLines={1}
        >
          {t(`quickRide.${state}`)}
        </Text>

        <DutyToggle
          value={onDuty}
          warn={reconnecting}
          busy={switching}
          locked={locked}
          disabled={frozen}
          onChange={next => (next ? onGoOnline() : onGoOffline())}
          accessibilityLabel={
            onDuty ? t('quickRide.goOffline') : t('quickRide.goOnline')
          }
        />
      </View>
    </LinearGradient>
  );
}

/* ------------------------------------------------ the switch */

const TRACK_W = 60;
const TRACK_H = 34;
const KNOB = 28;
const PAD = 3;
/** Border is 1px, so the knob travels the track minus its own width, the two
 *  paddings and the two borders. */
const TRAVEL = TRACK_W - KNOB - PAD * 2 - 2;

const KNOB_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.22,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
};

/**
 * Duty switch. The track carries the connection state itself — green while the
 * socket is live, amber while it is reconnecting — so the driver never sees a
 * switch that says "on" next to a status line that says otherwise.
 *
 * `useNativeDriver` is off because the track animates `backgroundColor`, which
 * the native driver cannot interpolate; one JS-driven value keeps the knob and
 * the track on the same clock.
 */
function DutyToggle({
  value,
  disabled = false,
  busy = false,
  locked = false,
  warn = false,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  disabled?: boolean;
  /** Mid-flight: spinner in the knob. */
  busy?: boolean;
  /** Held on by a ride: padlock in the knob. */
  locked?: boolean;
  /** Reconnecting — on, but not yet trustworthy. */
  warn?: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, value]);

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{ opacity: disabled ? 0.75 : 1 }}
    >
      <Animated.View
        style={{
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          padding: PAD,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.22)',
          backgroundColor: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [TRACK_OFF, warn ? TRACK_WARN : TRACK_LIVE],
          }),
        }}
      >
        <Animated.View
          style={{
            height: KNOB,
            width: KNOB,
            borderRadius: KNOB / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
            transform: [
              {
                translateX: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRAVEL],
                }),
              },
            ],
            ...KNOB_SHADOW,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : locked ? (
            <MaterialIcons name="lock" size={14} color={colors.secondary} />
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
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
