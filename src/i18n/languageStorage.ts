import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LanguageCode } from './index';

const LANGUAGE_KEY = '@bhy/language';

/** Returns the saved language, or null if the user hasn't chosen one yet. */
export async function getStoredLanguage(): Promise<LanguageCode | null> {
  try {
    const value = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (value === 'en' || value === 'hi') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persists the chosen language so we don't ask again on next launch. */
export async function setStoredLanguage(code: LanguageCode): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
  } catch {
    // Ignore storage failures; the app still works for this session.
  }
}
