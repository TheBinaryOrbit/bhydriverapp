import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import ScreenHeader from '../../components/ScreenHeader';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { FREE_PLAN_FEATURES } from '../../constants/subscription';
import { colors, navyGradient } from '../../theme/colors';

/**
 * The driver's plan — today always the free one, so this screen reads rather
 * than fetches: there is no subscription endpoint and no second plan to choose
 * between. What it does own is the promise that the plan is running and what it
 * covers, which is exactly what the welcome sheet says in short form.
 *
 * No end date is shown anywhere on purpose. We don't hold one, and inventing a
 * date a driver plans their month around would be worse than saying nothing.
 */
export default function SubscriptionScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title={t('subscription.title')} />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={navyGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 20 }}
        >
          <View className="flex-row items-start">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-white/15">
              <MaterialIcons
                name="workspace-premium"
                size={24}
                color={colors.primary}
              />
            </View>

            <View className="ml-3 flex-1">
              <Text className="text-lg font-extrabold text-white">
                {t('subscription.planName')}
              </Text>
              <Text className="mt-0.5 text-[13px] leading-5 text-white/70">
                {t('subscription.planTagline')}
              </Text>
            </View>

            <View
              className="flex-row items-center rounded-full px-2.5 py-1"
              style={{ backgroundColor: colors.successSurface }}
            >
              <View
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: colors.success }}
              />
              <Text
                className="ml-1.5 text-[11px] font-bold"
                style={{ color: colors.success }}
              >
                {t('subscription.activeBadge')}
              </Text>
            </View>
          </View>

          <View className="mt-5 flex-row items-baseline">
            <Text className="text-3xl font-extrabold text-white">
              {t('subscription.price')}
            </Text>
            <Text className="ml-2 text-[13px] font-semibold text-white/70">
              {t('subscription.priceNote')}
            </Text>
          </View>
        </LinearGradient>

        <Text className="mb-2 ml-1 mt-6 text-xs font-bold uppercase tracking-wide text-muted">
          {t('subscription.includedTitle')}
        </Text>

        <View
          className="overflow-hidden rounded-2xl border border-border bg-white"
          style={CARD_SHADOW}
        >
          {FREE_PLAN_FEATURES.map((feature, index) => (
            <View
              key={feature.key}
              className={`flex-row items-start px-4 py-4 ${
                index > 0 ? 'border-t border-border' : ''
              }`}
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-surface">
                <MaterialIcons
                  name={feature.icon}
                  size={19}
                  color={colors.tertiary}
                />
              </View>

              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-semibold text-secondary">
                  {t(`subscription.features.${feature.key}.title`)}
                </Text>
                <Text className="mt-0.5 text-[13px] leading-5 text-muted">
                  {t(`subscription.features.${feature.key}.body`)}
                </Text>
              </View>

              <MaterialIcons
                name="check-circle"
                size={18}
                color={colors.success}
              />
            </View>
          ))}
        </View>

        <View className="mt-5 flex-row items-start rounded-2xl border border-border bg-white p-4">
          <MaterialIcons name="info-outline" size={18} color={colors.muted} />
          <Text className="ml-2.5 flex-1 text-[12px] leading-5 text-muted">
            {t('subscription.note')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
