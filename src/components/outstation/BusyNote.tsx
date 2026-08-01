import React from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';

type Props = {
  /** The server's `busyReason` code. Unknown or absent falls back to prose. */
  reason?: string | null;
  /** The server's own sentence, used when there is no code to match. */
  message?: string | null;
};

/**
 * Why the driver cannot take work right now.
 *
 * Availability is derived from both ride collections and the two products block
 * each other asymmetrically — an outstation trip leaves the driver free to take
 * QuickRides until two hours before departure, but not the other way round.
 * That is impossible to guess from an empty list, which is exactly why the
 * server sends a code rather than only prose: each of the three has a different
 * answer, and two of them are "this is temporary, here's when it lifts".
 *
 * Shared by both home tabs — `busyReason` means the same thing on both, and a
 * driver blocked by an outstation pickup needs to read it on the QuickRide tab
 * where the rides stopped arriving.
 */
export default function BusyNote({ reason, message }: Props) {
  const { t } = useTranslation();

  const COPY: Record<string, { icon: string; title: string; body: string }> = {
    active_quick_ride: {
      icon: 'local-taxi',
      title: t('busy.quickRideTitle'),
      body: t('busy.quickRideBody'),
    },
    active_outstation_ride: {
      icon: 'event-available',
      title: t('busy.outstationTitle'),
      body: t('busy.outstationBody'),
    },
    outstation_pickup_imminent: {
      icon: 'schedule',
      title: t('busy.imminentTitle'),
      body: t('busy.imminentBody'),
    },
  };

  const copy = (reason && COPY[reason]) || {
    icon: 'info-outline',
    title: t('busy.title'),
    body: message ?? t('busy.body'),
  };

  return (
    <View
      className="mt-4 flex-row items-start rounded-2xl border p-4"
      style={{
        borderColor: colors.warningSurface,
        backgroundColor: colors.warningSurface,
      }}
    >
      <MaterialIcons name={copy.icon} size={18} color={colors.warning} />
      <View className="ml-2.5 flex-1">
        <Text
          className="text-[13px] font-bold"
          style={{ color: colors.warning }}
        >
          {copy.title}
        </Text>
        <Text
          className="mt-1 text-xs leading-5"
          style={{ color: colors.warning }}
        >
          {copy.body}
        </Text>
      </View>
    </View>
  );
}
