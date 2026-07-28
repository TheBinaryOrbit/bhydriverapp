import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/types';
import KeyboardSafeView from '../../components/KeyboardSafeView';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenHeader from '../../components/ScreenHeader';
import FormField from '../../components/form/FormField';
import ImageUpload from '../../components/form/ImageUpload';
import OptionSelector from '../../components/form/OptionSelector';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../services/api';
import { updateProfile, type ProfileChanges } from '../../services/driverService';
import { colors } from '../../theme/colors';
import type { PickedImage } from '../../types/driver';
import { notify } from '../../utils/notify';
import {
  dobToIso,
  formatDobInput,
  isValidAadhaar,
  isValidDob,
  isValidEmail,
} from '../../utils/validators';

type Props = NativeStackScreenProps<RootStackParamList, 'EditPersonalInfo'>;

type Values = {
  name: string;
  email: string;
  /** Masked `DD/MM/YYYY`. */
  dob: string;
  gender: string;
  address: string;
  aadharCardNumber: string;
  dlNumber: string;
};

type Errors = Partial<Record<keyof Values | 'form', string>>;

/**
 * `PATCH /drivers/me` is a partial update, so this screen tracks the values it
 * loaded and sends only what actually changed — an empty request would be a 400.
 * The phone number is the login identity and stays read-only.
 */
export default function EditPersonalInfoScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { token, driver, loading, setDriver } = useAuth();

  const [values, setValues] = useState<Values>(EMPTY);
  const [initial, setInitial] = useState<Values>(EMPTY);
  const [profileImage, setProfileImage] = useState<PickedImage | null>(null);
  const [dlFrontImage, setDlFrontImage] = useState<PickedImage | null>(null);
  const [dlBackImage, setDlBackImage] = useState<PickedImage | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Seed the form once; later profile refreshes must not stomp on live edits.
  useEffect(() => {
    if (!driver || hydrated) {
      return;
    }
    const seeded: Values = {
      name: driver.name ?? '',
      email: driver.email ?? '',
      dob: isoToMasked(driver.dob),
      gender: driver.gender ?? '',
      address: driver.address ?? '',
      aadharCardNumber: driver.aadharCardNumber ?? '',
      dlNumber: driver.dlDetails?.dlNumber ?? '',
    };
    setValues(seeded);
    setInitial(seeded);
    setHydrated(true);
  }, [driver, hydrated]);

  const update = useCallback(<K extends keyof Values>(key: K, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const changes = useMemo<ProfileChanges>(() => {
    const diff: ProfileChanges = {};
    if (values.name !== initial.name) {
      diff.name = values.name;
    }
    if (values.email !== initial.email) {
      diff.email = values.email;
    }
    if (values.dob !== initial.dob) {
      diff.dob = dobToIso(values.dob);
    }
    if (values.gender !== initial.gender) {
      diff.gender = values.gender;
    }
    if (values.address !== initial.address) {
      diff.address = values.address;
    }
    if (values.aadharCardNumber !== initial.aadharCardNumber) {
      diff.aadharCardNumber = values.aadharCardNumber;
    }
    if (values.dlNumber !== initial.dlNumber) {
      diff.dlNumber = values.dlNumber;
    }
    if (profileImage) {
      diff.profileImage = profileImage;
    }
    if (dlFrontImage) {
      diff.dlFrontImage = dlFrontImage;
    }
    if (dlBackImage) {
      diff.dlBackImage = dlBackImage;
    }
    return diff;
  }, [values, initial, profileImage, dlFrontImage, dlBackImage]);

  const isDirty = Object.keys(changes).length > 0;

  const validate = useCallback((): Errors => {
    const next: Errors = {};
    if (!values.name.trim()) {
      next.name = t('onboarding.errors.nameRequired');
    }
    if (values.email && !isValidEmail(values.email)) {
      next.email = t('onboarding.errors.email');
    }
    if (values.dob && !isValidDob(values.dob)) {
      next.dob = t('onboarding.errors.dob');
    }
    if (values.aadharCardNumber && !isValidAadhaar(values.aadharCardNumber)) {
      next.aadharCardNumber = t('onboarding.errors.aadhar');
    }
    return next;
  }, [values, t]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    if (!token) {
      return;
    }
    if (!isDirty) {
      notify(t('editProfile.nothingChanged'));
      return;
    }

    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      notify(t('onboarding.errors.fixFields'));
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(token, changes);
      setDriver(updated);
      notify(t('editProfile.saved'));
      navigation.goBack();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        // 409s land here: email / Aadhaar / DL already belong to someone else.
        const mapped: Errors = {};
        error.fieldErrors.forEach(item => {
          const key = FIELD_ALIASES[item.field ?? ''] ?? (item.field as keyof Values);
          if (key && item.message) {
            mapped[key] = item.message;
          }
        });
        setErrors(mapped);
      }
      notify(
        error instanceof Error ? error.message : t('editProfile.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }, [token, isDirty, validate, changes, setDriver, t, navigation]);

  if (loading && !driver) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  return (
    <KeyboardSafeView>
      <ScreenHeader title={t('editProfile.title')} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <ImageUpload
          variant="avatar"
          label={t('onboarding.personal.profileImage')}
          hint={t('editProfile.replaceHint')}
          value={profileImage}
          currentUrl={driver?.profileImageUrl}
          onChange={setProfileImage}
        />

        <View className="mt-8 gap-4">
          <FormField
            label={t('onboarding.personal.name')}
            required
            value={values.name}
            onChangeText={text => update('name', text)}
            placeholder={t('onboarding.personal.namePlaceholder')}
            autoCapitalize="words"
            error={errors.name}
          />

          <FormField
            label={t('onboarding.personal.phone')}
            value={driver?.phoneNumber ?? ''}
            locked
            hint={t('editProfile.phoneLocked')}
            onChangeText={() => { }}
          />

          <FormField
            label={t('onboarding.personal.email')}
            value={values.email}
            onChangeText={text => update('email', text)}
            placeholder={t('onboarding.personal.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />

          <FormField
            label={t('onboarding.personal.dob')}
            value={values.dob}
            onChangeText={text => update('dob', formatDobInput(text))}
            placeholder="DD/MM/YYYY"
            keyboardType="number-pad"
            maxLength={10}
            locked
            error={errors.dob}
          />

          <OptionSelector
            label={t('onboarding.personal.gender')}
            value={values.gender}
            onChange={value => update('gender', value)}
            locked
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

          <FormField
            label={t('onboarding.documents.address')}
            value={values.address}
            onChangeText={text => update('address', text)}
            placeholder={t('onboarding.documents.addressPlaceholder')}
            multiline
            numberOfLines={3}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
            error={errors.address}
          />

          <FormField
            label={t('onboarding.documents.aadhar')}
            value={values.aadharCardNumber}
            onChangeText={text =>
              update('aadharCardNumber', text.replace(/[^0-9]/g, ''))
            }
            placeholder="1234 1234 1234"
            keyboardType="number-pad"
            maxLength={12}
            locked
            error={errors.aadharCardNumber}
          />

          <FormField
            label={t('onboarding.documents.dlNumber')}
            value={values.dlNumber}
            onChangeText={text => update('dlNumber', text.toUpperCase())}
            placeholder="BR01 20200001234"
            autoCapitalize="characters"
            error={errors.dlNumber}

          />

          <ImageUpload
            label={t('onboarding.documents.dlFront')}
            hint={t('editProfile.replaceHint')}
            value={dlFrontImage}
            currentUrl={driver?.dlDetails?.dlFrontImageUrl}
            onChange={setDlFrontImage}
          />

          <ImageUpload
            label={t('onboarding.documents.dlBack')}
            hint={t('editProfile.replaceHint')}
            value={dlBackImage}
            currentUrl={driver?.dlDetails?.dlBackImageUrl}
            onChange={setDlBackImage}
          />
        </View>
      </ScrollView>

      <View
        className="border-t border-border px-6 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <PrimaryButton
          label={t('editProfile.save')}
          icon="check"
          onPress={handleSave}
          loading={saving}
          disabled={!isDirty}
        />
      </View>
    </KeyboardSafeView>
  );
}

const EMPTY: Values = {
  name: '',
  email: '',
  dob: '',
  gender: '',
  address: '',
  aadharCardNumber: '',
  dlNumber: '',
};

/** Backend field names that don't match this form's keys. */
const FIELD_ALIASES: Record<string, keyof Values> = {
  'dlDetails.dlNumber': 'dlNumber',
  'DL number': 'dlNumber',
};

/** `1990-04-12T00:00:00.000Z` → `12/04/1990`. */
function isoToMasked(iso?: string): string {
  if (!iso) {
    return '';
  }
  const [year, month, day] = iso.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}
