import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/types';
import KeyboardSafeView from '../../components/KeyboardSafeView';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenHeader from '../../components/ScreenHeader';
import FormField from '../../components/form/FormField';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { useSignOut } from '../../hooks/useAuth';
import { ApiError } from '../../services/api';
import {
  fetchMyPaymentDetails,
  isValidUpiId,
  savePaymentDetails,
} from '../../services/paymentService';
import { cacheUpiId, getToken } from '../../storage/authStorage';
import { colors } from '../../theme/colors';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'ManagePayment'>;

/**
 * One UPI id per driver, used for payouts. `POST /payment-details` is an
 * upsert — the same call adds the first id and replaces an existing one.
 */
export default function ManagePaymentScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  const [upiId, setUpiId] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      await signOut();
      return;
    }
    try {
      // A 404 here is "no UPI id yet", handled in the service as null.
      const details = await fetchMyPaymentDetails(token);
      setSaved(details?.upiId ?? null);
      setUpiId(details?.upiId ?? '');
      // Keep the home screen's cache honest — this screen is the one place the
      // id can change, and it is also the freshest read of it we ever get.
      if (details?.upiId) {
        await cacheUpiId(details.upiId);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      notify(err instanceof Error ? err.message : t('payment.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [signOut, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    const token = await getToken();
    if (!token) {
      await signOut();
      return;
    }

    const trimmed = upiId.trim();
    if (!trimmed) {
      setError(t('payment.required'));
      return;
    }
    if (!isValidUpiId(trimmed)) {
      setError(t('payment.invalid'));
      return;
    }

    setSaving(true);
    try {
      const details = await savePaymentDetails(token, trimmed);
      await cacheUpiId(details.upiId);
      setSaved(details.upiId);
      notify(t('payment.saved'));
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      notify(err instanceof Error ? err.message : t('payment.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [upiId, navigation, signOut, t]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  const isDirty = upiId.trim() !== (saved ?? '');

  return (
    <KeyboardSafeView>
      <ScreenHeader title={t('payment.title')} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {saved ? (
          <View
            className="mb-6 flex-row items-center rounded-2xl border border-border bg-white p-4"
            style={CARD_SHADOW}
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-surface">
              <MaterialIcons
                name="account-balance-wallet"
                size={22}
                color={colors.secondary}
              />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t('payment.current')}
              </Text>
              <Text className="mt-0.5 text-base font-bold text-secondary">
                {saved}
              </Text>
            </View>
            <MaterialIcons
              name="check-circle"
              size={20}
              color={colors.tertiary}
            />
          </View>
        ) : (
          <View className="mb-6 items-center rounded-2xl border border-dashed border-border bg-white p-6">
            <MaterialIcons
              name="account-balance-wallet"
              size={30}
              color={colors.indicatorBorder}
            />
            <Text className="mt-3 text-base font-bold text-secondary">
              {t('payment.emptyTitle')}
            </Text>
            <Text className="mt-1 text-center text-sm text-muted">
              {t('payment.emptyBody')}
            </Text>
          </View>
        )}

        <FormField
          label={t('payment.upiLabel')}
          required
          value={upiId}
          onChangeText={text => {
            setUpiId(text.replace(/\s/g, ''));
            setError(undefined);
          }}
          placeholder="name@okaxis"
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
          hint={t('payment.upiHint')}
        />

        <View className="mt-4 flex-row items-start rounded-xl bg-[#e8f4fd] px-4 py-3">
          <MaterialIcons
            name="info-outline"
            size={15}
            color="rgba(0, 45, 75, 0.7)"
          />
          <Text
            className="ml-2 flex-1 text-xs"
            style={{ color: 'rgba(0, 45, 75, 0.8)' }}
          >
            {t('payment.note')}
          </Text>
        </View>
      </ScrollView>

      <View
        className="border-t border-border px-6 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <PrimaryButton
          label={saved ? t('payment.update') : t('payment.add')}
          icon="check"
          onPress={handleSave}
          loading={saving}
          disabled={!isDirty}
        />
      </View>
    </KeyboardSafeView>
  );
}
