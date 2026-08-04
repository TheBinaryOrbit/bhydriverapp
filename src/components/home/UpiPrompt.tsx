import React, { useState } from 'react';
import { Keyboard, Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import KeyboardSafeView from '../KeyboardSafeView';
import PrimaryButton from '../PrimaryButton';
import FormField from '../form/FormField';
import { colors } from '../../theme/colors';

/**
 * Asks for the payout UPI id when the driver hasn't given us one.
 *
 * There is no way past it. Every ride worked without a UPI id on file is money
 * that has nowhere to go, so the ask is not a suggestion — no close button, and
 * `onRequestClose` deliberately does nothing so the Android back button can't
 * dismiss it either. It closes when an id is saved.
 */

type Props = {
  visible: boolean;
  saving: boolean;
  error: string | null;
  onSubmit: (upiId: string) => void;
  onChange: () => void;
};

export default function UpiPrompt({
  visible,
  saving,
  error,
  onSubmit,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [upiId, setUpiId] = useState('');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Swallows the Android back button — there is nothing to go back to.
      onRequestClose={() => {}}
    >
      <KeyboardSafeView className="flex-1 justify-end bg-black/40">
        <View
          className="rounded-t-3xl bg-white px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />

          <View className="flex-row items-start">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-surface">
              <MaterialIcons
                name="account-balance-wallet"
                size={22}
                color={colors.tertiary}
              />
            </View>

            <View className="ml-3 flex-1">
              <Text className="text-lg font-extrabold text-secondary">
                {t('payment.emptyTitle')}
              </Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted">
                {t('payment.emptyBody')}
              </Text>
            </View>
          </View>

          <View className="mt-5">
            <FormField
              label={t('payment.upiLabel')}
              required
              value={upiId}
              onChangeText={text => {
                setUpiId(text.replace(/\s/g, ''));
                onChange();
              }}
              placeholder="name@okaxis"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              error={error ?? undefined}
              hint={t('payment.upiHint')}
              editable={!saving}
            />
          </View>

          <PrimaryButton
            className="mt-5"
            label={t('payment.add')}
            icon="check"
            loading={saving}
            onPress={() => {
              Keyboard.dismiss();
              onSubmit(upiId);
            }}
          />

          <Text className="mt-4 text-center text-[11px] leading-4 text-muted">
            {t('payment.note')}
          </Text>
        </View>
      </KeyboardSafeView>
    </Modal>
  );
}
