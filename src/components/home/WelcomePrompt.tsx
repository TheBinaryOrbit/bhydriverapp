import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import PrimaryButton from '../PrimaryButton';
import { WELCOME_FEATURES } from '../../constants/subscription';
import { colors, navyGradient } from '../../theme/colors';

type Props = {
  visible: boolean;
  /** First name, when we have one — the greeting reads better with it. */
  name?: string;
  onClose: () => void;
  /** Opens the plan in full; also closes the sheet. */
  onViewPlan: () => void;
};

/**
 * Greets a driver on their first home screen after signing up or logging in,
 * and tells them their free plan is already running.
 *
 * Dismissible from anywhere — unlike the UPI ask this blocks nothing, it's good
 * news. It shows once per sign-in; `useWelcome` owns that.
 */
export default function WelcomePrompt({
  visible,
  name,
  onClose,
  onViewPlan,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        {/* Swallows taps so the sheet itself doesn't dismiss. */}
        <Pressable
          className="rounded-t-3xl bg-white px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
          onPress={() => {}}
        >
          <View className="mb-5 h-1 w-10 self-center rounded-full bg-border" />

          <View className="items-center">
            <LinearGradient
              colors={navyGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                height: 64,
                width: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons
                name="celebration"
                size={32}
                color={colors.primary}
              />
            </LinearGradient>

            <Text className="mt-4 text-center text-xl font-extrabold text-secondary">
              {name
                ? t('subscription.welcome.titleNamed', { name })
                : t('subscription.welcome.title')}
            </Text>
            <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
              {t('subscription.welcome.body')}
            </Text>

            <View
              className="mt-4 flex-row items-center rounded-full px-3 py-1.5"
              style={{ backgroundColor: colors.successSurface }}
            >
              <MaterialIcons
                name="check-circle"
                size={15}
                color={colors.success}
              />
              <Text
                className="ml-1.5 text-xs font-bold"
                style={{ color: colors.success }}
              >
                {t('subscription.activeBadge')}
              </Text>
            </View>
          </View>

          <View className="mt-6 gap-3">
            {WELCOME_FEATURES.map(feature => (
              <View key={feature.key} className="flex-row items-center">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-surface">
                  <MaterialIcons
                    name={feature.icon}
                    size={18}
                    color={colors.tertiary}
                  />
                </View>
                <Text className="ml-3 flex-1 text-[13px] font-semibold text-secondary">
                  {t(`subscription.features.${feature.key}.title`)}
                </Text>
              </View>
            ))}
          </View>

          <PrimaryButton
            className="mt-6"
            label={t('subscription.welcome.action')}
            icon="arrow-forward"
            onPress={onClose}
          />

          <Pressable
            onPress={onViewPlan}
            className="mt-3 items-center py-2 active:opacity-60"
          >
            <Text className="text-sm font-bold text-tertiary">
              {t('subscription.welcome.viewPlan')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
