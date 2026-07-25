import React, { useEffect } from 'react';
import { Dimensions, Image, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getStoredLanguage } from '../i18n/languageStorage';
import { getToken } from '../storage/authStorage';


type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const { i18n } = useTranslation();

  useEffect(() => {
    let active = true;

    const timer = setTimeout(async () => {
      const [stored, token] = await Promise.all([
        getStoredLanguage(),
        getToken(),
      ]);
      if (!active) {
        return;
      }
      if (stored) {
        // Language already chosen on a previous launch — skip the picker.
        i18n.changeLanguage(stored);
      }
      if (token) {
        // Already signed in — go straight to the main app.
        navigation.replace('Main');
      } else if (stored) {
        navigation.replace('Login');
      } else {
        navigation.replace('LanguageSelect');
      }
    }, 3000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [navigation, i18n]);

  // Matches the example's 423x423 box, capped to the screen so it never clips.
  const logoSize = Math.min(Dimensions.get('window').width * 0.95, 423);

  return (
    <View className="flex-1 items-center justify-center bg-secondary">
      <Image
        source={require('../assets/finallogo.png')}
        style={{ width: logoSize, height: logoSize }}
        resizeMode="contain"
      />
    </View>
  );
}
