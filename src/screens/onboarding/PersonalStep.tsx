import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import FormField from '../../components/form/FormField';
import ImageUpload from '../../components/form/ImageUpload';
import OptionSelector from '../../components/form/OptionSelector';
import { formatDobInput } from '../../utils/validators';
import type { StepProps } from './types';

/** Step 1 — name, verified phone, DOB, email, gender and profile photo. */
export default function PersonalStep({
  form,
  errors,
  locked,
  onChange,
}: StepProps) {
  const { t } = useTranslation();
  const aadhaarHint = t('onboarding.personal.aadhaarLocked');

  return (
    <View>
      <Text className="text-xl font-bold text-secondary">
        {t('onboarding.personal.title')}
      </Text>
      <Text className="mt-1.5 text-sm font-medium leading-5 text-muted">
        {t('onboarding.personal.subtitle')}
      </Text>

      <ImageUpload
        className="mt-8"
        variant="avatar"
        label={t('onboarding.personal.profileImage')}
        hint={t('onboarding.personal.profileImageHint')}
        required
        value={form.profileImage}
        onChange={image => onChange('profileImage', image)}
        error={errors.profileImage}
      />

      <View className="mt-8 gap-4">
        <FormField
          label={t('onboarding.personal.name')}
          required
          value={form.name}
          onChangeText={text => onChange('name', text)}
          placeholder={t('onboarding.personal.namePlaceholder')}
          autoCapitalize="words"
          error={errors.name}
          locked
        />

        <FormField
          label={t('onboarding.personal.phone')}
          required
          value={form.phoneNumber}
          locked
          hint={t('onboarding.personal.phoneHint')}
          onChangeText={() => {}}
        />

        <FormField
          label={t('onboarding.personal.dob')}
          required
          value={form.dob}
          locked={locked.dob}
          hint={locked.dob ? aadhaarHint : undefined}
          onChangeText={text => onChange('dob', formatDobInput(text))}
          placeholder="DD/MM/YYYY"
          keyboardType="number-pad"
          maxLength={10}
          error={errors.dob}
        />

        <FormField
          label={t('onboarding.personal.email')}
          value={form.email}
          onChangeText={text => onChange('email', text)}
          placeholder={t('onboarding.personal.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />

        <OptionSelector
          label={t('onboarding.personal.gender')}
          required
          value={form.gender}
          locked={locked.gender}
          hint={locked.gender ? aadhaarHint : undefined}
          onChange={value => onChange('gender', value)}
          error={errors.gender}
          options={[
            {
              value: 'male',
              label: t('onboarding.gender.male'),
              icon: 'gender-male',
              iconSet: 'community',
            },
            {
              value: 'female',
              label: t('onboarding.gender.female'),
              icon: 'gender-female',
              iconSet: 'community',
            },
            {
              value: 'other',
              label: t('onboarding.gender.other'),
              icon: 'gender-transgender',
              iconSet: 'community',
            },
          ]}
        />
      </View>
    </View>
  );
}
