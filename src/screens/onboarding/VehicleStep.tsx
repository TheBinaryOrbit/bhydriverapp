import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import FormField from '../../components/form/FormField';
import ImageUpload from '../../components/form/ImageUpload';
import OptionSelector from '../../components/form/OptionSelector';
import SectionLabel from '../../components/form/SectionLabel';
import { colors } from '../../theme/colors';
import type { VehicleType } from '../../types/driver';
import type { StepProps } from './types';

type Props = StepProps & {
  vehicleTypes: VehicleType[];
  loadingTypes: boolean;
};

/** Step 3 — vehicle type, registration details, insurance and photos. */
export default function VehicleStep({
  form,
  errors,
  onChange,
  vehicleTypes,
  loadingTypes,
}: Props) {
  const { t } = useTranslation();

  // Selecting a type prefills seating from its `capacity` — still editable,
  // since a specific vehicle can differ from the type's standard.
  const handleSelectType = (typeId: string) => {
    onChange('vehicleTypeId', typeId);
    const capacity = vehicleTypes.find(type => type._id === typeId)?.capacity;
    if (capacity) {
      onChange('seatingCapacity', String(capacity));
    }
  };

  return (
    <View>
      <Text className="text-xl font-bold text-secondary">
        {t('onboarding.vehicle.title')}
      </Text>
      <Text className="mt-1.5 text-sm font-medium leading-5 text-muted">
        {t('onboarding.vehicle.subtitle')}
      </Text>

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

        <FormField
          label={t('onboarding.vehicle.owner')}
          required
          value={form.ownerName}
          onChangeText={text => onChange('ownerName', text)}
          placeholder={t('onboarding.vehicle.ownerPlaceholder')}
          autoCapitalize="words"
          hint={t('onboarding.vehicle.ownerHint')}
          error={errors.ownerName}
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

        <SectionLabel title={t('onboarding.vehicle.insurance')} required />
        <View className="-mt-2 flex-row gap-3">
          <FormField
            className="flex-1"
            label={t('onboarding.vehicle.insuranceMonth')}
            required
            value={form.insuranceExpiryMonth}
            onChangeText={text =>
              onChange('insuranceExpiryMonth', text.replace(/[^0-9]/g, ''))
            }
            placeholder="06"
            keyboardType="number-pad"
            maxLength={2}
            error={errors.insuranceExpiryMonth}
          />
          <FormField
            className="flex-1"
            label={t('onboarding.vehicle.insuranceYear')}
            required
            value={form.insuranceExpiryYear}
            onChangeText={text =>
              onChange('insuranceExpiryYear', text.replace(/[^0-9]/g, ''))
            }
            placeholder="2026"
            keyboardType="number-pad"
            maxLength={4}
            error={errors.insuranceExpiryYear}
          />
        </View>

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
      </View>
    </View>
  );
}
