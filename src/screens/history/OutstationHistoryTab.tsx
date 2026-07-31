import React from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { colors } from '../../theme/colors';

/**
 * Outstation history — a placeholder for the same reason `OutstationTab` is:
 * there is no outstation contract in `docs/` yet, so there is no history
 * endpoint to call. The shell is real; filling it in is a one-file change.
 */
export default function OutstationHistoryTab() {
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
          {t('history.outstationTitle')}
        </Text>
        <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
          {t('history.outstationBody')}
        </Text>

        <View className="mt-6 rounded-full bg-surface px-4 py-2">
          <Text className="text-xs font-bold text-muted">
            {t('outstation.comingSoon')}
          </Text>
        </View>
      </View>
    </View>
  );
}
