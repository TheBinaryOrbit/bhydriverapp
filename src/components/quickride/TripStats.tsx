import React from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';

/**
 * The three numbers that decide whether an offer is worth taking: how far the
 * driver is from the pickup, how long the trip itself is, and how long it will
 * take. Shared by both offer cards so QuickRide and Outstation read identically
 * — a driver switching tabs shouldn't have to re-learn where the numbers are.
 *
 * Pre-formatted strings, not numbers: the two products format from different
 * `format` modules, and both already have the string in hand.
 */

type Props = {
  /** Driver → pickup. */
  toPickup: string | null;
  /** Pickup → drop. */
  tripDistance: string | null;
  tripTime: string | null;
};

export default function TripStats({
  toPickup,
  tripDistance,
  tripTime,
}: Props) {
  const { t } = useTranslation();

  return (
    <View className="flex-row overflow-hidden rounded-2xl border border-border bg-surface">
      <Stat icon="near-me" value={toPickup} label={t('quickRide.statToPickup')} />
      <Stat
        icon="straighten"
        value={tripDistance}
        label={t('quickRide.statTrip')}
        divided
      />
      <Stat
        icon="schedule"
        value={tripTime}
        label={t('quickRide.statTime')}
        divided
      />
    </View>
  );
}

/**
 * One cell. Renders an em dash rather than collapsing when the number is
 * missing — three cells that keep their places are easier to read across a
 * list of cards than a row that changes shape per ride.
 */
function Stat({
  icon,
  value,
  label,
  divided = false,
}: {
  icon: string;
  value: string | null;
  label: string;
  divided?: boolean;
}) {
  return (
    <View
      className={`flex-1 items-center py-2.5 ${divided ? 'border-l border-border' : ''}`}
    >
      <View className="flex-row items-center">
        <MaterialIcons name={icon} size={12} color={colors.muted} />
        <Text className="ml-1 text-[13px] font-extrabold text-secondary">
          {value ?? '—'}
        </Text>
      </View>
      <Text className="text-[9px] font-bold uppercase tracking-wide text-muted">
        {label}
      </Text>
    </View>
  );
}
