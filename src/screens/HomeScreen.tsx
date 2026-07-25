import React from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import { colors } from '../theme/colors';

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <Screen className="bg-secondary" bottom={false}>
      <View className="bg-secondary px-6 pb-6 pt-4">
        <Text className="text-2xl font-extrabold text-white">
          {t('home.greeting')}
        </Text>
        <Text className="mt-1 text-sm text-white/70">{t('common.appName')}</Text>
      </View>

      <View className="flex-1 items-center justify-center bg-white px-6">
        <View className="h-20 w-20 items-center justify-center rounded-2xl bg-tertiary">
          <MaterialIcons name="home" size={36} color={colors.primary} />
        </View>
        <Text className="mt-6 text-xl font-bold text-secondary">
          {t('home.title')}
        </Text>
        <Text className="mt-2 text-center text-base text-muted">
          {t('home.body')}
        </Text>
      </View>
    </Screen>
  );
}
