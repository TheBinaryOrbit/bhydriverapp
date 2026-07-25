import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NativeModules, Platform } from 'react-native';

import en from './locales/en.json';
import hi from './locales/hi.json';

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
} as const;

export const supportedLanguages = [
  { code: 'en', label: 'English', glyph: 'A', subtitle: 'English' },
  { code: 'hi', label: 'हिंदी', glyph: 'ए', subtitle: 'Hindi' },
] as const;

export type LanguageCode = (typeof supportedLanguages)[number]['code'];

/**
 * Best-effort device locale detection without adding a native module.
 * Falls back to English if the device language isn't supported.
 */
function getDeviceLanguage(): LanguageCode {
  let locale = 'en';
  try {
    if (Platform.OS === 'ios') {
      locale =
        NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
        'en';
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier || 'en';
    }
  } catch {
    locale = 'en';
  }

  return locale.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
