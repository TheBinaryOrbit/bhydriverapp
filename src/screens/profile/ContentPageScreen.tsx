import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';
import {
  fetchContentPage,
  getCachedContentPage,
  wrapContentHtml,
} from '../../services/contentService';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ContentPage'>;

/**
 * Renders one server-managed page (Help & Support, About Us, Privacy, Terms)
 * by slug or id. The cached copy paints first, so the page opens instantly and
 * still works offline; the network copy replaces it when it lands.
 */
export default function ContentPageScreen({ route }: Props) {
  const { t } = useTranslation();
  const { slug, title } = route.params;

  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = await getCachedContentPage(slug);
    if (cached?.content) {
      setHtml(wrapContentHtml(cached.content));
    }
    try {
      const page = await fetchContentPage(slug);
      setHtml(wrapContentHtml(page.content));
      setError(null);
    } catch (err) {
      // Keep showing the cached copy if we have one.
      if (!cached) {
        setError(err instanceof Error ? err.message : t('content.loadFailed'));
      }
    }
  }, [slug, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View className="flex-1 bg-white">
      <ScreenHeader title={title} />

      {error ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-center text-sm text-muted">{error}</Text>
        </View>
      ) : html ? (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={{ flex: 1, backgroundColor: colors.primary }}
          showsVerticalScrollIndicator={false}
          // Links (including the Help page's `mailto:`) open outside the app
          // instead of navigating this WebView away from the content.
          onShouldStartLoadWithRequest={request => {
            if (request.url === 'about:blank') {
              return true;
            }
            Linking.openURL(request.url).catch(() => {});
            return false;
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.secondary} />
        </View>
      )}
    </View>
  );
}
