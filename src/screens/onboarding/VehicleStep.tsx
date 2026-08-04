import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import ExpiryPicker from '../../components/form/ExpiryPicker';
import FormField from '../../components/form/FormField';
import ImageUpload from '../../components/form/ImageUpload';
import OptionSelector from '../../components/form/OptionSelector';
import SectionLabel from '../../components/form/SectionLabel';
import ImportVehicleSheet from '../../components/onboarding/ImportVehicleSheet';
import { fetchLegacyVehicles } from '../../services/driverService';
import { colors } from '../../theme/colors';
import {
  matchVehicleType,
  type LegacyVehicle,
  type VehicleType,
} from '../../types/driver';
import { remoteImage } from '../../utils/imagePicker';
import { notify } from '../../utils/notify';
import { isFutureExpiry } from '../../utils/validators';
import type { OnboardingForm, StepProps } from './types';

type Props = StepProps & {
  vehicleTypes: VehicleType[];
  loadingTypes: boolean;
};

/** The step's photo slots — the fields an import can fill. */
type ImageField = Extract<
  keyof OnboardingForm,
  | 'vehicleFrontImage'
  | 'vehicleSideImage'
  | 'vehicleBackImage'
  | 'rcFrontImage'
  | 'rcBackImage'
>;

/** Step 3 — vehicle type, registration details, insurance and photos. */
export default function VehicleStep({
  form,
  errors,
  onChange,
  vehicleTypes,
  loadingTypes,
}: Props) {
  const { t } = useTranslation();

  /** What v2 holds for this number — empty until the lookup answers. */
  const [legacy, setLegacy] = useState<LegacyVehicle[]>([]);
  /** True only while the driver is choosing between several old vehicles. */
  const [picking, setPicking] = useState(false);

  // The lookup runs on its own as the driver reaches this step, so nothing is
  // offered until we know there's something to offer. A failure leaves the list
  // empty and the card hidden: a driver with nothing to import and one we
  // couldn't ask about both see the plain form, which is the honest default.
  useEffect(() => {
    let cancelled = false;
    fetchLegacyVehicles(form.phoneNumber)
      .then(vehicles => {
        if (!cancelled) {
          setLegacy(vehicles);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.phoneNumber]);

  // Selecting a type prefills seating from its `capacity` — still editable,
  // since a specific vehicle can differ from the type's standard.
  const handleSelectType = (typeId: string) => {
    onChange('vehicleTypeId', typeId);
    const capacity = vehicleTypes.find(type => type._id === typeId)?.capacity;
    if (capacity) {
      onChange('seatingCapacity', String(capacity));
    }
  };

  /**
   * Copies what the old record has into the form. Blank fields are left alone
   * rather than cleared, so importing never wipes something already typed, and
   * every imported value stays editable — this is a head start, not a lock.
   */
  const applyLegacyVehicle = (vehicle: LegacyVehicle) => {
    setPicking(false);

    const type = matchVehicleType(vehicleTypes, vehicle.vehicleType);
    if (type) {
      handleSelectType(type._id);
    }
    if (vehicle.registrationNumber) {
      onChange(
        'vehicleNumber',
        vehicle.registrationNumber.replace(/\s/g, '').toUpperCase(),
      );
    }
    if (vehicle.yearOfManufacture) {
      onChange('manufactureYear', vehicle.yearOfManufacture);
    }

    const expiry = insuranceExpiry(vehicle.insuranceExpDate);
    if (expiry) {
      onChange('insuranceExpiryMonth', expiry.month);
      onChange('insuranceExpiryYear', expiry.year);
    }

    // v2's photos come across as remote uploads that React Native sends
    // straight from their URL. They stay as replaceable as a typed field — the
    // driver can retake any of them before submitting.
    const [front, side, back] = vehicle.vehicleImageUrls;
    const photos = [
      importImage('vehicleFrontImage', front),
      importImage('vehicleSideImage', side),
      importImage('vehicleBackImage', back),
      importImage('rcFrontImage', vehicle.rcFrontImageUrl),
      importImage('rcBackImage', vehicle.rcBackImageUrl),
    ].filter(Boolean).length;

    // Old records often carry no photos at all, so the message reports what
    // actually arrived instead of implying the step is done.
    notify(
      !type
        ? t('onboarding.vehicle.import.doneNoType')
        : photos > 0
          ? t('onboarding.vehicle.import.doneWithPhotos', { count: photos })
          : t('onboarding.vehicle.import.done'),
    );
  };

  /**
   * Fills a photo slot from v2, never over something already picked. Reports
   * whether it actually filled one.
   */
  const importImage = (key: ImageField, url?: string): boolean => {
    if (!url || form[key]) {
      return false;
    }
    onChange(key, remoteImage(url));
    return true;
  };

  const handleImport = () => {
    if (legacy.length === 1) {
      applyLegacyVehicle(legacy[0]);
      return;
    }
    setPicking(true);
  };

  return (
    <View>
      <Text className="text-xl font-bold text-secondary">
        {t('onboarding.vehicle.title')}
      </Text>
      <Text className="mt-1.5 text-sm font-medium leading-5 text-muted">
        {t('onboarding.vehicle.subtitle')}
      </Text>

      {/* Returning drivers only: the card appears once the lookup has actually
          found something on their number, so a new driver never sees an offer
          that would come back empty. Importing needs the type list to map v2's
          type name onto a v3 id, so the button waits for that. */}
      {legacy.length > 0 && (
        <View className="mt-6 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center">
            <MaterialIcons name="history" size={20} color={colors.tertiary} />
            <Text className="ml-2 flex-1 text-sm font-bold text-secondary">
              {t('onboarding.vehicle.import.title')}
            </Text>
          </View>
          <Text className="mt-1.5 text-xs leading-4 text-muted">
            {t('onboarding.vehicle.import.subtitle', { count: legacy.length })}
          </Text>
          <Pressable
            onPress={handleImport}
            disabled={loadingTypes}
            className={`mt-3 h-11 flex-row items-center justify-center rounded-xl border border-tertiary active:opacity-80 ${
              loadingTypes ? 'opacity-60' : ''
            }`}
          >
            {loadingTypes ? (
              <ActivityIndicator size="small" color={colors.tertiary} />
            ) : (
              <>
                <MaterialIcons
                  name="download"
                  size={18}
                  color={colors.tertiary}
                />
                <Text className="ml-1.5 text-sm font-bold text-tertiary">
                  {t('onboarding.vehicle.import.action')}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <ImportVehicleSheet
        visible={picking}
        vehicles={legacy}
        onSelect={applyLegacyVehicle}
        onClose={() => setPicking(false)}
      />

      <View className="mt-8 gap-4">
        {loadingTypes ? (
          <View className="items-center py-6">
            <ActivityIndicator color={colors.secondary} />
          </View>
        ) : (
          <OptionSelector
            label={t('onboarding.vehicle.type')}
            required
            stacked
            value={form.vehicleTypeId}
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
              icon: 'directions-car',
            }))}
          />
        )}

        <FormField
          label={t('onboarding.vehicle.number')}
          required
          value={form.vehicleNumber}
          onChangeText={text =>
            onChange('vehicleNumber', text.replace(/\s/g, '').toUpperCase())
          }
          placeholder="BR01AB1234"
          autoCapitalize="characters"
          maxLength={12}
          error={errors.vehicleNumber}
        />

        <FormField
          label={t('onboarding.vehicle.name')}
          required
          value={form.vehicleName}
          onChangeText={text => onChange('vehicleName', text)}
          placeholder={t('onboarding.vehicle.namePlaceholder')}
          autoCapitalize="words"
          error={errors.vehicleName}
        />


        <View className="flex-row gap-3">
          <FormField
            className="flex-1"
            label={t('onboarding.vehicle.seating')}
            required
            value={form.seatingCapacity}
            onChangeText={text =>
              onChange('seatingCapacity', text.replace(/[^0-9]/g, ''))
            }
            placeholder="4"
            keyboardType="number-pad"
            maxLength={2}
            hint={t('onboarding.vehicle.seatingHint')}
            error={errors.seatingCapacity}
          />
          <FormField
            className="flex-1"
            label={t('onboarding.vehicle.year')}
            required
            value={form.manufactureYear}
            onChangeText={text =>
              onChange('manufactureYear', text.replace(/[^0-9]/g, ''))
            }
            placeholder="2019"
            keyboardType="number-pad"
            maxLength={4}
            error={errors.manufactureYear}
          />
        </View>

        <ExpiryPicker
          label={t('onboarding.vehicle.insurance')}
          month={form.insuranceExpiryMonth}
          year={form.insuranceExpiryYear}
          onChangeMonth={value => onChange('insuranceExpiryMonth', value)}
          onChangeYear={value => onChange('insuranceExpiryYear', value)}
          hint={t('onboarding.vehicle.insuranceHint')}
          error={errors.insuranceExpiryMonth ?? errors.insuranceExpiryYear}
        />

        <SectionLabel title={t('onboarding.vehicle.photos')} required />
        <View className="-mt-2 gap-4">
          <ImageUpload
            label={t('onboarding.vehicle.photoFront')}
            required
            value={form.vehicleFrontImage}
            onChange={image => onChange('vehicleFrontImage', image)}
            error={errors.vehicleFrontImage}
          />
          <ImageUpload
            label={t('onboarding.vehicle.photoSide')}
            required
            value={form.vehicleSideImage}
            onChange={image => onChange('vehicleSideImage', image)}
            error={errors.vehicleSideImage}
          />
          <ImageUpload
            label={t('onboarding.vehicle.photoBack')}
            required
            value={form.vehicleBackImage}
            onChange={image => onChange('vehicleBackImage', image)}
            error={errors.vehicleBackImage}
          />
        </View>

        <SectionLabel title={t('vehicleForm.rc')} required />
        <View className="-mt-2 gap-4">
          <ImageUpload
            label={t('vehicleForm.rcFront')}
            required
            value={form.rcFrontImage}
            onChange={image => onChange('rcFrontImage', image)}
            error={errors.rcFrontImage}
          />
          <ImageUpload
            label={t('vehicleForm.rcBack')}
            required
            value={form.rcBackImage}
            onChange={image => onChange('rcBackImage', image)}
            error={errors.rcBackImage}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * The month and year the expiry picker expects, from v2's ISO expiry, or `null`
 * when there isn't a usable one. Both are plain numbers, matching what the
 * picker stores and the backend reads.
 *
 * Read in local time on purpose: v2 stored these as midnight IST, so an expiry
 * of 31 July arrives as `…-07-30T18:30:00Z` and only reads back as July on the
 * driver's own clock.
 *
 * A lapsed policy is dropped rather than imported. v2's records are old enough
 * that most of their expiries are long past, and the picker only offers dates
 * from next month on — importing one would set a value it can't even show.
 */
function insuranceExpiry(
  iso?: string,
): { month: string; year: string } | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const month = String(date.getMonth() + 1);
  const year = String(date.getFullYear());
  return isFutureExpiry(month, year) ? { month, year } : null;
}
