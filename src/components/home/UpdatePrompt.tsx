import React from 'react';
import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import PrimaryButton from '../PrimaryButton';
import { storeDeepLink, storeUrl } from '../../services/appSettings';
import { colors } from '../../theme/colors';

type Props = {
  visible: boolean;
  /** `appVersion` — display only, and may be missing. */
  version?: string;
  /** No way past it: no Later, no backdrop, no back button. */
  mandatory: boolean;
  onLater: () => void;
};

/**
 * "There's a newer build than yours."
 *
 * Two prompts in one, and the difference is the whole point of the flag on the
 * settings document. A **mandatory** update is a wall: the driver cannot work on
 * this build, so there is no Later, the backdrop swallows taps and
 * `onRequestClose` does nothing — the Android back button included. Anything
 * less is a nudge they can wave away for the session.
 *
 * The gate that decides which is in `checkForUpdate`, and it compares build
 * numbers. Nothing here reads `appVersion` for anything but the sentence.
 */
export default function UpdatePrompt({
  visible,
  version,
  mandatory,
  onLater,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  /**
   * The Play app first, the web listing second. `market://` has no handler on a
   * phone without the store — an emulator, or a device where it is disabled — and
   * `openURL` rejects there rather than doing nothing, which is what makes the
   * fallback reachable.
   */
  const openStore = () => {
    Linking.openURL(storeDeepLink()).catch(() => {
      Linking.openURL(storeUrl()).catch(() => {
        // Nowhere left to send them. The prompt stays up, which for a mandatory
        // update is the honest outcome.
      });
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={mandatory ? () => {} : onLater}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={mandatory ? undefined : onLater}
      >
        {/* Swallows taps so the sheet itself never dismisses. */}
        <Pressable
          className="rounded-t-3xl bg-white px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
          onPress={() => {}}
        >
          {mandatory ? null : (
            <View className="mb-5 h-1 w-10 self-center rounded-full bg-border" />
          )}

          <View className="items-center">
            <View
              className="h-16 w-16 items-center justify-center rounded-full"
              style={{
                backgroundColor: mandatory
                  ? colors.dangerSurface
                  : colors.surface,
              }}
            >
              <MaterialIcons
                name="system-update"
                size={30}
                color={mandatory ? colors.danger : colors.tertiary}
              />
            </View>

            <Text className="mt-4 text-center text-xl font-extrabold text-secondary">
              {t('update.title')}
            </Text>
            <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
              {mandatory ? t('update.bodyRequired') : t('update.body')}
            </Text>

            {version ? (
              <View className="mt-3 rounded-full bg-surface px-3 py-1.5">
                <Text className="text-xs font-bold text-secondary">
                  {t('update.version', { version })}
                </Text>
              </View>
            ) : null}
          </View>

          <PrimaryButton
            className="mt-6"
            label={t('update.action')}
            icon="download"
            onPress={openStore}
          />

          {mandatory ? null : (
            <Pressable
              onPress={onLater}
              className="mt-3 items-center py-2 active:opacity-60"
            >
              <Text className="text-sm font-bold text-muted">
                {t('update.later')}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
