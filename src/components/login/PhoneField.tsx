import React from 'react';
import { Text, TextInput, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
};

/**
 * Phone number input with a fixed +91 (India) country chip.
 * Matches the example's `_buildPhoneInput`.
 */
export default function PhoneField({ value, onChangeText }: Props) {
  const { t } = useTranslation();

  return (
    <View
      className="flex-row items-center rounded-xl border border-border bg-white px-4 py-3"
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      {/* Country chip */}
      <View className="flex-row items-center rounded-lg bg-surface px-3 py-2">
        <Text className="text-base">🇮🇳</Text>
        <Text className="ml-1.5 text-base font-semibold text-secondary">+91</Text>
        <MaterialIcons
          name="keyboard-arrow-down"
          size={18}
          color={colors.secondary}
        />
      </View>

      <TextInput
        className="ml-3 flex-1 text-base font-medium text-secondary"
        value={value}
        onChangeText={text => onChangeText(text.replace(/[^0-9]/g, ''))}
        keyboardType="phone-pad"
        maxLength={10}
        placeholder={t('login.mobilePlaceholder')}
        placeholderTextColor="#9e9e9e"
      />
    </View>
  );
}
