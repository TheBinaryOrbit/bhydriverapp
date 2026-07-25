import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '../navigation/types';
import Screen from '../components/Screen';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { clearSession } from '../storage/authStorage';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();

  // Temporary logout: clear the saved session and return to the login screen.
  const handleLogout = async () => {
    await clearSession();
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <Screen className="bg-secondary" bottom={false}>
      <View className="bg-secondary px-6 pb-6 pt-4">
        <Text className="text-2xl font-extrabold text-white">
          {t('settings.title')}
        </Text>
      </View>

      <View className="flex-1 bg-white px-6 pt-6">
        <View className="flex-row items-center justify-between rounded-xl border border-border bg-white p-4">
          <Text className="text-base font-semibold text-secondary">
            {t('settings.language')}
          </Text>
          <LanguageSwitcher />
        </View>

        {/* Temporary logout button */}
        <Pressable
          onPress={handleLogout}
          className="mt-4 flex-row items-center justify-center rounded-xl border border-tertiary bg-white p-4 active:opacity-80"
        >
          <MaterialIcons name="logout" size={20} color="#ff6b05" />
          <Text className="ml-2 text-base font-bold text-tertiary">
            {t('settings.logout')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
