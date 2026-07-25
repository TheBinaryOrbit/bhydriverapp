import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { supportedLanguages, type LanguageCode } from '../i18n';
import { setStoredLanguage } from '../i18n/languageStorage';

/**
 * Compact pill-style toggle to switch between the supported languages.
 */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('hi') ? 'hi' : 'en';

  const onChange = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    setStoredLanguage(code);
  };

  return (
    <View className="flex-row rounded-full border border-border bg-white p-1">
      {supportedLanguages.map(lang => {
        const active = current === lang.code;
        return (
          <Pressable
            key={lang.code}
            onPress={() => onChange(lang.code)}
            className={`rounded-full px-4 py-1.5 ${active ? 'bg-secondary' : 'bg-transparent'}`}
          >
            <Text
              className={`text-sm font-semibold ${active ? 'text-white' : 'text-secondary'}`}
            >
              {lang.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
