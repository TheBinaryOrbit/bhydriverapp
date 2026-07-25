import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { supportedLanguages, type LanguageCode } from '../i18n';
import { setStoredLanguage } from '../i18n/languageStorage';
import { colors, navyGradient } from '../theme/colors';
import PrimaryButton from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'LanguageSelect'>;

type LanguageOption = (typeof supportedLanguages)[number];

export default function LanguageSelectScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const initial: LanguageCode = i18n.language?.startsWith('hi') ? 'hi' : 'en';
  const [selected, setSelected] = useState<LanguageCode>(initial);

  const onSelect = (code: LanguageCode) => {
    setSelected(code);
    // Apply immediately so the heading/button preview updates live.
    i18n.changeLanguage(code);
  };

  const onContinue = async () => {
    await setStoredLanguage(selected);
    navigation.replace('Login');
  };

  return (
    <View
      className="flex-1 bg-white px-6"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom }}
    >
      {/* Decorative translate badge */}
      <LinearGradient
        colors={navyGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.secondary,
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <MaterialIcons name="translate" size={30} color={colors.primary} />
      </LinearGradient>

      {/* Heading */}
      <Text className="mt-7 text-2xl font-bold text-secondary">
        {t('languageSelect.title')}
      </Text>
      <Text className="mt-2 text-sm font-medium text-muted">
        {t('languageSelect.subtitle')}
      </Text>

      {/* Language options */}
      <View className="mt-10 gap-4">
        {supportedLanguages.map(option => (
          <LanguageCard
            key={option.code}
            option={option}
            selected={selected === option.code}
            onPress={() => onSelect(option.code)}
          />
        ))}
      </View>

      <View className="flex-1" />

      {/* Continue button (shared navy-gradient button) */}
      <PrimaryButton
        label={t('languageSelect.continue')}
        icon="arrow-forward"
        onPress={onContinue}
        className="mb-10"
      />
    </View>
  );
}

function LanguageCard({
  option,
  selected,
  onPress,
}: {
  option: LanguageOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 16,
        borderRadius: 16,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.secondary : colors.border,
        backgroundColor: selected ? colors.surface : colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: colors.secondary,
        shadowOpacity: selected ? 0.1 : 0.05,
        shadowRadius: selected ? 8 : 4,
        shadowOffset: { width: 0, height: selected ? 2 : 1 },
        elevation: selected ? 3 : 1,
      }}
    >
      {/* Script glyph badge */}
      {selected ? (
        <LinearGradient
          colors={navyGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glyphBadge}
        >
          <Text className="text-[28px] font-bold text-white">
            {option.glyph}
          </Text>
        </LinearGradient>
      ) : (
        <View style={[styles.glyphBadge, { backgroundColor: colors.surface }]}>
          <Text className="text-[28px] font-bold text-secondary">
            {option.glyph}
          </Text>
        </View>
      )}

      {/* Name (own script) + English descriptor */}
      <View className="ml-4 flex-1">
        <Text className="text-lg font-bold text-secondary">{option.label}</Text>
        <Text className="mt-0.5 text-[13px] font-medium text-muted">
          {option.subtitle}
        </Text>
      </View>

      {/* Selection indicator */}
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: selected ? colors.secondary : colors.indicatorBorder,
          backgroundColor: selected ? colors.secondary : 'transparent',
        }}
      >
        {selected ? (
          <MaterialIcons name="check" size={16} color={colors.primary} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = {
  glyphBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
