import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '../navigation/types';
import MenuSection, {
  CARD_SHADOW,
  type MenuRow,
} from '../components/profile/MenuSection';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useAuth, useSignOut } from '../hooks/useAuth';
import {
  fetchContentList,
  getCachedContentList,
} from '../services/contentService';
import { fetchMyPaymentDetails } from '../services/paymentService';
import { fetchDriverReviews } from '../services/reviewService';
import { fetchMyVehicles } from '../services/vehicleService';
import { colors, navyGradient } from '../theme/colors';
import type { AppContentSummary } from '../types/driver';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const APP_VERSION = '1.0.0';

/**
 * Driver profile hub: identity card fed by `GET /drivers/me`, then the edit
 * screens (personal info, vehicles, payment) and the server-driven support
 * pages.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const signOut = useSignOut();

  const { token, driver, loading, reload } = useAuth();
  const driverId = driver?._id;

  const [pages, setPages] = useState<AppContentSummary[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState<string | null>(null);
  const [upiId, setUpiId] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Support pages are public — render the cached menu, then refresh it.
  const loadPages = useCallback(async () => {
    const cached = await getCachedContentList();
    if (cached.length > 0) {
      setPages(cached);
    }
    try {
      setPages(await fetchContentList());
    } catch {
      // Keep whatever is cached; the section just won't update this time.
    }
  }, []);

  const loadSummaries = useCallback(async () => {
    if (!token) {
      return;
    }
    // Both are decoration on the rows — a failure must not blank the screen.
    try {
      // One vehicle per driver — show its number as the row's status.
      const vehicles = await fetchMyVehicles(token);
      setVehicleNumber(vehicles[0]?.vehicleNumber ?? null);
    } catch {
      setVehicleNumber(null);
    }
    try {
      const payment = await fetchMyPaymentDetails(token);
      setUpiId(payment?.upiId ?? null);
    } catch {
      setUpiId(null);
    }
    // Only the summary is wanted here — one row asks for a page of reviews and
    // reads the average off the header, which is cheaper than a second endpoint
    // that doesn't exist.
    if (driverId) {
      try {
        const page = await fetchDriverReviews(token, driverId, { limit: 1 });
        setRating(page.driver?.averageRating ?? null);
      } catch {
        setRating(null);
      }
    }
  }, [driverId, token]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([reload(), loadPages(), loadSummaries()]);
    setRefreshing(false);
  }, [loadPages, loadSummaries, reload]);

  const kycVerified = driver?.isKycCompleted === true;

  const accountRows: MenuRow[] = [
    {
      key: 'personal',
      label: t('profile.personalInfo'),
      icon: 'person-outline',
      onPress: () => navigation.navigate('EditPersonalInfo'),
    },
    {
      key: 'kyc',
      label: t('profile.kyc'),
      icon: 'verified-user',
      value: kycVerified ? t('profile.kycVerified') : t('profile.kycIncomplete'),
      valueTone: kycVerified ? 'success' : 'warning',
      onPress: () => navigation.navigate('Kyc'),
    },
    {
      key: 'vehicle',
      label: t('profile.manageVehicle'),
      icon: 'directions-car',
      value: vehicleNumber ?? undefined,
      onPress: () => navigation.navigate('EditVehicle'),
    },
    {
      key: 'payment',
      label: t('profile.managePayment'),
      icon: 'account-balance-wallet',
      value: upiId ?? t('profile.notAdded'),
      onPress: () => navigation.navigate('ManagePayment'),
    },
    {
      key: 'reviews',
      label: t('profile.myReviews'),
      icon: 'star-outline',
      // The rating is the whole reason to open this row, so it goes on the row.
      value:
        typeof rating === 'number'
          ? t('profile.ratingValue', { rating: rating.toFixed(1) })
          : undefined,
      onPress: () => navigation.navigate('MyReviews'),
    },
  ];

  const supportRows: MenuRow[] = pages.map(page => ({
    key: page._id,
    label: page.name,
    icon: page.iconName || 'file-document-outline',
    iconSet: 'community',
    onPress: () =>
      navigation.navigate('ContentPage', {
        slug: page.slug,
        title: page.name,
      }),
  }));

  if (loading && !driver) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.secondary}
        />
      }
    >
      {/* Navy banner the identity card sits on top of */}
      <LinearGradient
        colors={navyGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 16, paddingBottom: 64 }}
      >
        <Text className="px-6 text-2xl font-extrabold text-white">
          {t('profile.title')}
        </Text>
      </LinearGradient>

      <View className="-mt-12 px-4">
        <View
          className="rounded-2xl border border-border bg-white p-5"
          style={CARD_SHADOW}
        >
          <View className="flex-row items-center">
            <Avatar name={driver?.name} url={driver?.profileImageUrl} />

            <View className="ml-4 flex-1">
              <Text
                className="text-lg font-bold text-secondary"
                numberOfLines={1}
              >
                {driver?.name?.trim() || t('profile.noName')}
              </Text>

              <View className="mt-1.5 flex-row items-center">
                <MaterialIcons name="phone" size={13} color={colors.muted} />
                <Text className="ml-1.5 text-[13px] font-medium text-muted">
                  +91 {driver?.phoneNumber ?? '—'}
                </Text>
              </View>

              {driver?.email ? (
                <View className="mt-1 flex-row items-center">
                  <MaterialIcons name="mail" size={13} color={colors.muted} />
                  <Text
                    className="ml-1.5 flex-1 text-[13px] font-medium text-muted"
                    numberOfLines={1}
                  >
                    {driver.email}
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => navigation.navigate('EditPersonalInfo')}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface active:opacity-70"
            >
              <MaterialIcons name="edit" size={18} color={colors.secondary} />
            </Pressable>
          </View>

          {driver && !kycVerified ? (
            <Pressable
              onPress={() => navigation.navigate('Kyc')}
              className="mt-4 flex-row items-center rounded-xl bg-[#fff4ec] px-3 py-2.5 active:opacity-70"
            >
              <MaterialIcons
                name="gpp-maybe"
                size={15}
                color={colors.warning}
              />
              <Text
                className="ml-2 flex-1 text-xs font-semibold"
                style={{ color: colors.warning }}
              >
                {t('profile.kycPending')}
              </Text>
              <MaterialIcons
                name="chevron-right"
                size={18}
                color={colors.warning}
              />
            </Pressable>
          ) : null}
        </View>

        <View
          className="mt-5 rounded-2xl border border-border bg-white p-4"
          style={CARD_SHADOW}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px] font-semibold text-secondary">
              {t('settings.language')}
            </Text>
            <LanguageSwitcher />
          </View>
        </View>

        <MenuSection title={t('profile.sections.account')} rows={accountRows} />
        <MenuSection title={t('profile.sections.support')} rows={supportRows} />

        <Pressable
          onPress={signOut}
          className="mt-5 flex-row items-center justify-center rounded-2xl border border-border bg-white py-4 active:opacity-80"
          style={CARD_SHADOW}
        >
          <MaterialIcons name="logout" size={19} color={colors.tertiary} />
          <Text className="ml-2 text-[15px] font-bold text-tertiary">
            {t('settings.logout')}
          </Text>
        </Pressable>

        <Text className="mt-6 text-center text-xs text-muted">
          {t('profile.version', { version: APP_VERSION })}
        </Text>
      </View>
    </ScrollView>
  );
}

/** Profile photo, or the driver's initials while none is uploaded. */
function Avatar({ name, url }: { name?: string; url?: string }) {
  const initials = (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');

  return (
    <View
      className="h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-secondary"
      style={{ borderWidth: 2, borderColor: colors.tertiary }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          className="h-full w-full"
          resizeMode="cover"
        />
      ) : initials ? (
        <Text className="text-xl font-bold text-white">{initials}</Text>
      ) : (
        <MaterialIcons name="person" size={28} color={colors.primary} />
      )}
    </View>
  );
}
