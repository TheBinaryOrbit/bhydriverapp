import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import FormField from '../../components/form/FormField';
import ImageUpload from '../../components/form/ImageUpload';
import type { StepProps } from './types';

/** Step 2 — Aadhaar, driving licence (number + both sides) and address. */
export default function DocumentsStep({ form, errors, onChange }: StepProps) {
  const { t } = useTranslation();

  // KYC gives us the last four digits masked. When we have them the driver
  // only types the other eight, and the two halves are joined at submit.
  const verifiedTail = form.aadhaarLast4;

  return (
    <View>
      <Text className="text-xl font-bold text-secondary">
        {t('onboarding.documents.title')}
      </Text>
      <Text className="mt-1.5 text-sm font-medium leading-5 text-muted">
        {t('onboarding.documents.subtitle')}
      </Text>

      <View className="mt-8 gap-4">
        {verifiedTail ? (
          <View className="flex-row items-start gap-3">
            <FormField
              className="flex-1"
              label={t('onboarding.documents.aadharFirstEight')}
              required
              value={form.aadharCardNumber}
              onChangeText={text =>
                onChange(
                  'aadharCardNumber',
                  text.replace(/[^0-9]/g, '').slice(0, 8),
                )
              }
              placeholder="1234 5678"
              keyboardType="number-pad"
              maxLength={8}
              error={errors.aadharCardNumber}
              hint={t('onboarding.documents.aadharFirstEightHint')}
            />
            <FormField
              className="w-24"
              label={t('onboarding.documents.aadharLastFour')}
              value={verifiedTail}
              locked
              onChangeText={() => {}}
            />
          </View>
        ) : (
          <FormField
            label={t('onboarding.documents.aadhar')}
            required
            value={form.aadharCardNumber}
            onChangeText={text =>
              onChange('aadharCardNumber', text.replace(/[^0-9]/g, ''))
            }
            placeholder="1234 1234 1234"
            keyboardType="number-pad"
            maxLength={12}
            error={errors.aadharCardNumber}
            hint={t('onboarding.documents.aadharHint')}
          />
        )}

        <FormField
          label={t('onboarding.documents.dlNumber')}
          required
          value={form.dlNumber}
          onChangeText={text => onChange('dlNumber', text.toUpperCase())}
          placeholder="BR01 20200001234"
          autoCapitalize="characters"
          error={errors.dlNumber}
        />

        <FormField
          label={t('onboarding.documents.address')}
          required
          value={form.address}
          onChangeText={text => onChange('address', text)}
          placeholder={t('onboarding.documents.addressPlaceholder')}
          multiline
          numberOfLines={3}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
          error={errors.address}
        />

        <ImageUpload
          label={t('onboarding.documents.dlFront')}
          hint={t('onboarding.documents.imageHint')}
          required
          value={form.dlFrontImage}
          onChange={image => onChange('dlFrontImage', image)}
          error={errors.dlFrontImage}
        />

        <ImageUpload
          label={t('onboarding.documents.dlBack')}
          hint={t('onboarding.documents.imageHint')}
          required
          value={form.dlBackImage}
          onChange={image => onChange('dlBackImage', image)}
          error={errors.dlBackImage}
        />
      </View>
    </View>
  );
}
