import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import {
  currentAppSettings,
  fetchAppSettings,
  trimmed,
} from '../../services/appSettings';
import { colors } from '../../theme/colors';
import { notify } from '../../utils/notify';

/** YouTube's own red, because that is what the row is promising to open. */
const YOUTUBE_RED = '#ff0000';
const YOUTUBE_RED_SURFACE = 'rgba(255, 0, 0, 0.08)';

/**
 * "How to register yourself" — the walkthrough video, on the screen where a
 * driver who has just verified their phone is being asked to hand over their
 * Aadhaar.
 *
 * That is the moment the video is worth offering: it is the first screen after
 * the OTP, the driver has no account yet, and what they are being asked for is
 * the most personal thing the app will ever want. A two-minute video is the
 * cheapest way to answer "what is this and why".
 *
 * The link is `onboardingLink` from `GET /settings/:type`, and it may be an
 * empty string — the doc is explicit that an empty one means *hide the entry
 * point* rather than open a blank page. So this renders nothing at all until a
 * usable link is in hand, including while the settings call is still in flight.
 */
export default function HowToRegister() {
  const { t } = useTranslation();
  const [link, setLink] = useState<string | null>(() =>
    trimmed(currentAppSettings()?.onboardingLink),
  );

  useEffect(() => {
    let cancelled = false;
    fetchAppSettings().then(settings => {
      if (!cancelled) {
        setLink(trimmed(settings?.onboardingLink));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!link) {
    return null;
  }

  const open = () => {
    // Out to YouTube (or whatever the admin pointed this at), not into a webview
    // — the video app handles playback, casting and full screen far better than
    // an embedded page, and the driver comes straight back with the back button.
    Linking.openURL(link).catch(() => {
      notify(t('kyc.videoFailed'));
    });
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t('kyc.howToRegister')}
      className="mt-4 flex-row items-center rounded-2xl border border-border bg-white p-3 active:bg-surface"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: YOUTUBE_RED_SURFACE }}
      >
        <MaterialIcons name="smart-display" size={22} color={YOUTUBE_RED} />
      </View>

      <View className="ml-3 flex-1">
        <Text className="text-[14px] font-bold text-secondary">
          {t('kyc.howToRegister')}
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted">
          {t('kyc.howToRegisterBody')}
        </Text>
      </View>

      <MaterialIcons
        name="chevron-right"
        size={22}
        color={colors.indicatorBorder}
      />
    </Pressable>
  );
}
