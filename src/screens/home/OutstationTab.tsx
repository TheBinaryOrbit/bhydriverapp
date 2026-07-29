import React from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { colors } from '../../theme/colors';

/**
 * Outstation — the long-distance, pre-booked half of the home screen.
 *
 * Deliberately a placeholder: there is no outstation contract in `docs/` yet,
 * and inventing endpoints here would be worse than an honest "not yet". The
 * shell is real so wiring it up later is only a matter of filling this in.
 */
export default function OutstationTab() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-white px-6 pt-10">
      <View
        className="items-center rounded-2xl border border-border bg-white p-7"
        style={CARD_SHADOW}
      >
        <View
          className="h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.surface }}
        >
          <MaterialIcons name="map" size={36} color={colors.tertiary} />
        </View>

        <Text className="mt-5 text-lg font-extrabold text-secondary">
          {t('outstation.title')}
        </Text>
        <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
          {t('outstation.body')}
        </Text>

        <View className="mt-5 w-full">
          <Bullet icon="event" text={t('outstation.point1')} />
          <Bullet icon="route" text={t('outstation.point2')} />
          <Bullet icon="payments" text={t('outstation.point3')} />
        </View>

        <View className="mt-6 rounded-full bg-surface px-4 py-2">
          <Text className="text-xs font-bold text-muted">
            {t('outstation.comingSoon')}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Bullet({ icon, text }: { icon: string; text: string }) {
  return (
    <View className="mt-3 flex-row items-start">
      <MaterialIcons
        name={icon}
        size={16}
        color={colors.secondaryMuted}
        style={{ marginTop: 1 }}
      />
      <Text className="ml-2.5 flex-1 text-[13px] leading-5 text-muted">
        {text}
      </Text>
    </View>
  );
}
