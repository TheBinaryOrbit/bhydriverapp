import React from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { distance, duration, rideMoment, rupees } from '../quickride/format';
import i18n, { supportedLanguages } from '../../i18n';
import { colors } from '../../theme/colors';
import type { QuickRide, RideStatus } from '../../types/quickRide';

type Props = { ride: QuickRide };

/**
 * Icon + tint per outcome. The tint only ever colours an icon and its label —
 * the card itself stays white, so a screen full of them reads as one list
 * rather than a stack of coloured blocks. `searching` never reaches history.
 */
const STATUS_STYLE: Record<RideStatus, { icon: string; fg: string }> = {
  completed: { icon: 'check-circle', fg: colors.success },
  cancelled: { icon: 'cancel', fg: colors.danger },
  expired: { icon: 'timer-off', fg: colors.warning },
  in_progress: { icon: 'local-taxi', fg: colors.warning },
  assigned: { icon: 'hourglass-top', fg: colors.warning },
  searching: { icon: 'search', fg: colors.muted },
};

/**
 * One past ride. Read-only by design — a finished ride has no action left, and
 * the live ride is reached from the home tab, never from here.
 */
export default function RideHistoryCard({ ride }: Props) {
  const { t } = useTranslation();

  const status = STATUS_STYLE[ride.rideStatus] ?? STATUS_STYLE.searching;
  const completed = ride.rideStatus === 'completed';

  // `finalFare` is what the driver was actually paid; `offeredFare` is only
  // what the rider asked for and is wrong the moment a bid was accepted below
  // it. Fall back to it just so a row is never blank.
  const fare = ride.finalFare ?? ride.offeredFare;

  // The moment that ended the ride, whichever one that was.
  const when = rideMoment(ride.completedAt ?? ride.startedAt ?? ride.createdAt);

  const note =
    ride.rideStatus === 'cancelled'
      ? cancelNote(ride.cancellationReason, t)
      : null;

  const chips = [
    { icon: 'straighten', label: distance(ride.estimatedDistanceKm) },
    { icon: 'schedule', label: duration(ride.estimatedDurationMin) },
    { icon: 'directions-car', label: ride.vehicleTypeId?.name },
  ].filter(chip => !!chip.label);

  return (
    <View
      className="mb-4 rounded-3xl border border-border bg-white p-4"
      style={CARD_SHADOW}
    >
      {/* Outcome and payout — the two things a driver scans a history list
          for, on one line. */}
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <View className="flex-row items-center">
            <MaterialIcons name={status.icon} size={17} color={status.fg} />
            <Text
              className="ml-1.5 text-[13px] font-bold"
              style={{ color: status.fg }}
            >
              {t(`history.status.${ride.rideStatus}`)}
            </Text>
          </View>

          {when ? (
            <View className="mt-1.5 flex-row items-center">
              <MaterialIcons
                name="event"
                size={13}
                color={colors.indicatorBorder}
              />
              <Text className="ml-1.5 text-xs font-semibold text-muted">
                {when}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="ml-3 items-end">
          <Text className="text-[24px] font-extrabold leading-7 text-secondary">
            {rupees(fare)}
          </Text>
          <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            {completed ? t('history.earned') : t('history.fare')}
          </Text>
        </View>
      </View>

      <View className="mt-4 border-t border-border pt-4">
        <Leg
          icon="trip-origin"
          tint={colors.success}
          label={t('ride.pickup')}
          value={ride.pickupLocationName}
        />

        {/* Connector, centred under the 16px icon above it. */}
        <View
          className="my-1 ml-[7px] w-0.5 rounded-full"
          style={{ height: 14, backgroundColor: colors.border }}
        />

        <Leg
          icon="place"
          tint={colors.tertiary}
          label={t('ride.drop')}
          value={ride.dropLocationName}
        />
      </View>

      {chips.length > 0 ? (
        <View className="mt-4 flex-row flex-wrap border-t border-border pt-3">
          {chips.map(chip => (
            <View
              key={chip.icon}
              className="mr-2 mt-1 flex-row items-center rounded-full border border-border px-2.5 py-1.5"
            >
              <MaterialIcons
                name={chip.icon}
                size={13}
                color={colors.secondaryMuted}
              />
              <Text className="ml-1.5 text-[11px] font-bold text-muted">
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {note ? (
        <View className="mt-3 flex-row items-start">
          <MaterialIcons
            name="info-outline"
            size={14}
            color={colors.danger}
            style={{ marginTop: 1 }}
          />
          <Text
            className="ml-2 flex-1 text-xs font-semibold leading-4"
            style={{ color: colors.danger }}
          >
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** One end of the trip: pin, caption, address. */
function Leg({
  icon,
  tint,
  label,
  value,
}: {
  icon: string;
  tint: string;
  label: string;
  value?: string;
}) {
  return (
    <View className="flex-row items-start">
      <MaterialIcons
        name={icon}
        size={16}
        color={tint}
        style={{ marginTop: 2 }}
      />
      <View className="ml-3 flex-1">
        <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
          {label}
        </Text>
        <Text
          className="mt-0.5 text-[14px] font-semibold text-secondary"
          numberOfLines={2}
        >
          {value ?? '—'}
        </Text>
      </View>
    </View>
  );
}

/**
 * Every bundled translation of the reason this app sends when the driver
 * cancels without typing one.
 *
 * `cancellationReason` is stored as free text in whatever language the app was
 * in at the time, so the driver could have cancelled in Hindi and be reading
 * this in English. Matching all of them is what lets a stored "Cancelled by
 * driver" be shown back as "Cancelled by you" either way.
 */
const OWN_CANCEL_REASONS = new Set(
  supportedLanguages.map(({ code }) =>
    i18n.t('ride.cancelDefaultReason', { lng: code }).trim().toLowerCase(),
  ),
);

/** Catches a server-side or older-build default this app never phrased. */
const OWN_CANCEL_PATTERN = /^cancell?ed by (the )?driver\.?$/i;

/**
 * The cancellation line to show. A reason the driver typed is left as they
 * wrote it — it says more than "by you" does. Only the default is rewritten,
 * because "Cancelled by driver" reads as a third party to the driver who
 * cancelled it.
 */
function cancelNote(
  reason: string | undefined,
  t: (key: string) => string,
): string | null {
  const text = reason?.trim();
  if (!text) {
    return null;
  }
  return OWN_CANCEL_REASONS.has(text.toLowerCase()) ||
    OWN_CANCEL_PATTERN.test(text)
    ? t('history.cancelledByYou')
    : text;
}

/** Deeper than the shared card shadow — history rows are the whole screen. */
const CARD_SHADOW = {
  shadowColor: colors.secondary,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
} as const;
