import React from 'react';
import { Linking, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { CARD_SHADOW } from '../profile/MenuSection';
import { wrapContentHtml } from '../../services/contentService';
import { colors } from '../../theme/colors';

type Props = {
  /** `homePageContent` — a raw HTML fragment written by an admin. */
  html: string;
};

/**
 * Whatever the admin has put on `homePageContent`, filling the space the
 * QuickRide tab has while the driver is offline.
 *
 * It used to be a sheet that opened over the home screen at launch, and a sheet
 * is the wrong shape for this: it arrives while the driver is doing something,
 * it has to be dismissed before anything else can be reached, and once closed
 * the notice is gone for the rest of the launch whether or not it was read. Here
 * it costs the driver nothing — it occupies a panel that was otherwise an icon
 * and two lines of "you're offline" — and it is still there when they come back
 * to look at it.
 *
 * Offline only, by the same logic. Once the driver goes online that panel is the
 * searching state, and a notice has no business sitting where the next ride
 * request appears.
 *
 * Rendered in a `WebView` because the field is a raw HTML fragment — headings,
 * lists, links, whatever was typed into the admin panel — and dressed in *our*
 * CSS via `wrapContentHtml`, the same wrapper the content pages use. Styling it
 * here rather than trusting what comes down is the point: an admin pasting a
 * `<style>` block should not be able to repaint the app.
 */
export default function HomeNoticeCard({ html }: Props) {
  const { t } = useTranslation();

  return (
    // `flex-1` inside the list's empty slot, which is what gives the WebView a
    // height to fill — it has no intrinsic one of its own.
    <View className="flex-1 py-4">
      <View
        className="flex-1 overflow-hidden rounded-2xl border border-border bg-white"
        style={CARD_SHADOW}
      >
        <View className="flex-row items-center px-4 pb-2 pt-3.5">
          <MaterialIcons name="campaign" size={18} color={colors.tertiary} />
          <Text className="ml-2 flex-1 text-[13px] font-extrabold text-secondary">
            {t('homeNotice.title')}
          </Text>
        </View>

        <View className="flex-1">
          <WebView
            originWhitelist={['*']}
            source={{ html: wrapContentHtml(html) }}
            style={styles.web}
            showsVerticalScrollIndicator={false}
            // Links leave for the browser rather than navigating the card
            // somewhere the driver cannot get back from.
            onShouldStartLoadWithRequest={request => {
              if (request.url === 'about:blank') {
                return true;
              }
              Linking.openURL(request.url).catch(() => {});
              return false;
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = { web: { flex: 1, backgroundColor: colors.primary } } as const;
