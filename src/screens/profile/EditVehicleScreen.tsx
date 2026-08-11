import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import ImageUpload from '../../components/form/ImageUpload';
import OptionSelector from '../../components/form/OptionSelector';
import SectionLabel from '../../components/form/SectionLabel';
import { useSignOut } from '../../hooks/useAuth';
import { ApiError } from '../../services/api';
import { fetchVehicleTypes } from '../../services/driverService';
import {
  createVehicle,
  fetchMyVehicles,
  updateVehicle,
  type VehicleChanges,
} from '../../services/vehicleService';
import { getToken } from '../../storage/authStorage';
import { colors } from '../../theme/colors';
import {
  vehicleTypeIdOf,
  type PickedImage,
  type Vehicle,
  type VehicleType,
} from '../../types/driver';
import { notify } from '../../utils/notify';
import {
  isValidExpiryYear,
  isValidMonth,
  isValidVehicleNumber,
  isValidYear,
} from '../../utils/validators';

type Props = NativeStackScreenProps<RootStackParamList, 'EditVehicle'>;

type Values = {
  vehicleTypeId: string;
  vehicleNumber: string;
  vehicleName: string;
  ownerName: string;
  seatingCapacity: string;
  manufactureYear: string;
  insuranceExpiryMonth: string;
  insuranceExpiryYear: string;
};

/** The three vehicle photo slots, in `PHOTO_SLOTS` order. */
type PhotoKey = 'photo0' | 'photo1' | 'photo2';

type RcKey = 'rcFrontImage' | 'rcBackImage';

type Errors = Partial<Record<keyof Values | PhotoKey | RcKey, string>>;

/**
 * A driver may own exactly one vehicle, created during onboarding, so this
 * screen loads that vehicle and edits it (`PATCH /vehicles/:id`). It falls back
 * to `POST /vehicles` only if the driver somehow has none. Edits are partial —
 * only changed fields go up.
 */
export default function EditVehicleScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const isEdit = Boolean(vehicleId);

  const [values, setValues] = useState<Values>(EMPTY);
  const [initial, setInitial] = useState<Values>(EMPTY);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [images, setImages] = useState<(PickedImage | null)[]>([null, null, null]);
  const [rcFrontImage, setRcFrontImage] = useState<PickedImage | null>(null);
  const [rcBackImage, setRcBackImage] = useState<PickedImage | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      await signOut();
      return;
    }
    try {
      const [types, vehicles] = await Promise.all([
        fetchVehicleTypes(),
        fetchMyVehicles(token),
      ]);
      setVehicleTypes(types);

      // One vehicle per driver — whatever comes back is theirs.
      const found = vehicles[0] ?? null;
      setVehicle(found);
      setVehicleId(found?._id ?? null);
      if (found) {
        const seeded: Values = {
          vehicleTypeId: vehicleTypeIdOf(found),
          vehicleNumber: found.vehicleNumber ?? '',
          vehicleName: found.vehicleName ?? '',
          ownerName: found.ownerName ?? '',
          seatingCapacity: numberToText(found.seatingCapacity),
          manufactureYear: numberToText(found.manufactureYear),
          insuranceExpiryMonth: numberToText(found.insuranceExpiry?.month),
          insuranceExpiryYear: numberToText(found.insuranceExpiry?.year),
        };
        setValues(seeded);
        setInitial(seeded);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      notify(err instanceof Error ? err.message : t('vehicles.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [signOut, t]);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback(<K extends keyof Values>(key: K, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  /** Drops a non-text field's error as soon as the driver acts on it. */
  const clearError = useCallback((key: keyof Errors) => {
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const handleSelectType = useCallback(
    (typeId: string) => {
      update('vehicleTypeId', typeId);
      const capacity = vehicleTypes.find(type => type._id === typeId)?.capacity;
      if (capacity && !values.seatingCapacity) {
        update('seatingCapacity', String(capacity));
      }
    },
    [update, vehicleTypes, values.seatingCapacity],
  );

  const pickedImages = images.filter(Boolean) as PickedImage[];

  const changes = useMemo<VehicleChanges>(() => {
    const diff: VehicleChanges = {};
    (Object.keys(values) as (keyof Values)[]).forEach(key => {
      if (!isEdit || values[key] !== initial[key]) {
        diff[key] = values[key];
      }
    });
    if (pickedImages.length > 0) {
      diff.vehicleImages = pickedImages;
    }
    if (rcFrontImage) {
      diff.rcFrontImage = rcFrontImage;
    }
    if (rcBackImage) {
      diff.rcBackImage = rcBackImage;
    }
    return diff;
  }, [values, initial, isEdit, pickedImages, rcFrontImage, rcBackImage]);

  const isDirty = Object.keys(changes).length > 0;

  const validate = useCallback((): Errors => {
    const next: Errors = {};
    if (!values.vehicleTypeId) {
      next.vehicleTypeId = t('onboarding.errors.vehicleTypeRequired');
    }
    if (!values.vehicleNumber.trim()) {
      next.vehicleNumber = t('onboarding.errors.vehicleNumberRequired');
    } else if (!isValidVehicleNumber(values.vehicleNumber)) {
      next.vehicleNumber = t('onboarding.errors.vehicleNumber');
    }

    const seats = Number(values.seatingCapacity);
    if (values.seatingCapacity && (!seats || seats < 1 || seats > 60)) {
      next.seatingCapacity = t('onboarding.errors.seating');
    }
    if (values.manufactureYear && !isValidYear(values.manufactureYear)) {
      next.manufactureYear = t('onboarding.errors.year');
    }
    if (values.insuranceExpiryMonth && !isValidMonth(values.insuranceExpiryMonth)) {
      next.insuranceExpiryMonth = t('onboarding.errors.month');
    }
    if (values.insuranceExpiryYear && !isValidExpiryYear(values.insuranceExpiryYear)) {
      next.insuranceExpiryYear = t('onboarding.errors.expiryYear');
    }

    // All three photos are mandatory. On an edit they already live on the
    // server, so only demand them once the driver touches one — uploading
    // replaces the whole array, which would wipe the ones left untouched.
    if (!isEdit || pickedImages.length > 0) {
      images.forEach((image, index) => {
        if (!image) {
          next[`photo${index}` as PhotoKey] = isEdit
            ? t('vehicleForm.photoAllRequired')
            : t('onboarding.errors.imageRequired');
        }
      });
    }

    // Both RC sides are mandatory. Unlike the vehicle photos, each side is
    // replaced independently server-side, so one already on the server counts
    // as satisfied — the driver only has to upload what's missing.
    if (!rcFrontImage && !vehicle?.rcDetails?.frontImageUrl) {
      next.rcFrontImage = t('onboarding.errors.imageRequired');
    }
    if (!rcBackImage && !vehicle?.rcDetails?.backImageUrl) {
      next.rcBackImage = t('onboarding.errors.imageRequired');
    }
    return next;
  }, [
    values,
    isEdit,
    images,
    pickedImages.length,
    rcFrontImage,
    rcBackImage,
    vehicle,
    t,
  ]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    const token = await getToken();
    if (!token) {
      await signOut();
      return;
    }
    if (isEdit && !isDirty) {
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
      if (isEdit && vehicleId) {
        await updateVehicle(token, vehicleId, changes);
        notify(t('vehicleForm.updated'));
      } else {
        await createVehicle(token, changes);
        notify(t('vehicleForm.added'));
      }
      navigation.goBack();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      notify(error instanceof Error ? error.message : t('vehicleForm.failed'));
    } finally {
      setSaving(false);
    }
  }, [isEdit, isDirty, validate, vehicleId, changes, navigation, signOut, t]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  return (
    <KeyboardSafeView>
      <ScreenHeader
        title={isEdit ? t('vehicleForm.title') : t('vehicleForm.addTitle')}
      />

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
        <View className="gap-4">
          <OptionSelector
            label={t('onboarding.vehicle.type')}
            required
            stacked
            value={values.vehicleTypeId}
            onChange={handleSelectType}
            error={errors.vehicleTypeId}
            options={vehicleTypes.map(type => ({
              value: type._id,
              label: type.name,
              caption: [
                type.description,
                type.capacity
                  ? t('onboarding.vehicle.seats', { count: type.capacity })
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
              // Same row as onboarding's, artwork included — this screen edits
              // the vehicle that step created.
              iconUrl: type.icon,
              icon: 'directions-car',
            }))}
          />

          <FormField
            label={t('onboarding.vehicle.number')}
            required
            value={values.vehicleNumber}
            onChangeText={text =>
              update('vehicleNumber', text.replace(/\s/g, '').toUpperCase())
            }
            placeholder="BR01AB1234"
            autoCapitalize="characters"
            maxLength={12}
            error={errors.vehicleNumber}
          />

          <FormField
            label={t('onboarding.vehicle.name')}
            value={values.vehicleName}
            onChangeText={text => update('vehicleName', text)}
            placeholder={t('onboarding.vehicle.namePlaceholder')}
            autoCapitalize="words"
            error={errors.vehicleName}
          />

          <FormField
            label={t('onboarding.vehicle.owner')}
            value={values.ownerName}
            onChangeText={text => update('ownerName', text)}
            placeholder={t('onboarding.vehicle.ownerPlaceholder')}
            autoCapitalize="words"
            error={errors.ownerName}
          />

          <View className="flex-row gap-3">
            {/* <FormField
              className="flex-1"
              label={t('onboarding.vehicle.seating')}
              value={values.seatingCapacity}
              onChangeText={text =>
                update('seatingCapacity', text.replace(/[^0-9]/g, ''))
              }
              placeholder="4"
              keyboardType="number-pad"
              maxLength={2}
              error={errors.seatingCapacity}
            /> */}
            <FormField
              className="flex-1"
              label={t('onboarding.vehicle.year')}
              value={values.manufactureYear}
              onChangeText={text =>
                update('manufactureYear', text.replace(/[^0-9]/g, ''))
              }
              placeholder="2019"
              keyboardType="number-pad"
              maxLength={4}
              error={errors.manufactureYear}
            />
          </View>

          {/* Unstarred here: on an edit these keep their saved values. */}
          <SectionLabel title={t('onboarding.vehicle.insurance')} />
          <View className="-mt-2 flex-row gap-3">
            <FormField
              className="flex-1"
              label={t('onboarding.vehicle.insuranceMonth')}
              value={values.insuranceExpiryMonth}
              onChangeText={text =>
                update('insuranceExpiryMonth', text.replace(/[^0-9]/g, ''))
              }
              placeholder="06"
              keyboardType="number-pad"
              maxLength={2}
              error={errors.insuranceExpiryMonth}
            />
            <FormField
              className="flex-1"
              label={t('onboarding.vehicle.insuranceYear')}
              value={values.insuranceExpiryYear}
              onChangeText={text =>
                update('insuranceExpiryYear', text.replace(/[^0-9]/g, ''))
              }
              placeholder="2027"
              keyboardType="number-pad"
              maxLength={4}
              error={errors.insuranceExpiryYear}
            />
          </View>

          <SectionLabel title={t('onboarding.vehicle.photos')} required />

          {/* Uploading photos replaces the whole array server-side. */}
          {isEdit && pickedImages.length > 0 ? (
            <View className="-mt-2 flex-row items-center rounded-xl bg-[#fff4ec] px-3 py-2.5">
              <MaterialIcons
                name="info-outline"
                size={15}
                color={colors.tertiary}
              />
              <Text className="ml-2 flex-1 text-xs font-medium text-tertiary">
                {t('vehicleForm.photosReplaceWarning')}
              </Text>
            </View>
          ) : null}

          <View className={isEdit ? 'gap-4' : '-mt-2 gap-4'}>
            {PHOTO_SLOTS.map((slot, index) => (
              <ImageUpload
                key={slot.key}
                label={t(slot.labelKey)}
                required
                error={errors[`photo${index}` as PhotoKey]}
                value={images[index]}
                currentUrl={vehicle?.vehicleImages?.[index]}
                onChange={image =>
                  setImages(prev => {
                    const next = [...prev];
                    next[index] = image;
                    return next;
                  })
                }
              />
            ))}
          </View>

          <SectionLabel title={t('vehicleForm.rc')} required />
          <View className="-mt-2 gap-4">
            <ImageUpload
              label={t('vehicleForm.rcFront')}
              required
              error={errors.rcFrontImage}
              value={rcFrontImage}
              currentUrl={vehicle?.rcDetails?.frontImageUrl || undefined}
              onChange={image => {
                setRcFrontImage(image);
                clearError('rcFrontImage');
              }}
            />
            <ImageUpload
              label={t('vehicleForm.rcBack')}
              required
              error={errors.rcBackImage}
              value={rcBackImage}
              currentUrl={vehicle?.rcDetails?.backImageUrl || undefined}
              onChange={image => {
                setRcBackImage(image);
                clearError('rcBackImage');
              }}
            />
          </View>
        </View>
      </ScrollView>

      <View
        className="border-t border-border px-6 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <PrimaryButton
          label={isEdit ? t('editProfile.save') : t('vehicleForm.addTitle')}
          icon="check"
          onPress={handleSave}
          loading={saving}
          disabled={isEdit && !isDirty}
        />
      </View>
    </KeyboardSafeView>
  );
}

const EMPTY: Values = {
  vehicleTypeId: '',
  vehicleNumber: '',
  vehicleName: '',
  ownerName: '',
  seatingCapacity: '',
  manufactureYear: '',
  insuranceExpiryMonth: '',
  insuranceExpiryYear: '',
};

const PHOTO_SLOTS = [
  { key: 'front', labelKey: 'onboarding.vehicle.photoFront' },
  { key: 'side', labelKey: 'onboarding.vehicle.photoSide' },
  { key: 'back', labelKey: 'onboarding.vehicle.photoBack' },
] as const;

function numberToText(value?: number): string {
  return value === undefined || value === null ? '' : String(value);
}
