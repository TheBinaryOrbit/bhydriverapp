import React from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';
import type { LegacyVehicle } from '../../types/driver';

type Props = {
  visible: boolean;
  vehicles: LegacyVehicle[];
  onSelect: (vehicle: LegacyVehicle) => void;
  onClose: () => void;
};

/**
 * Which of the driver's previously registered vehicles to import into the
 * onboarding form. Only shown when the legacy API returns more than one — a
 * single vehicle is applied without asking.
 */
export default function ImportVehicleSheet({
  visible,
  vehicles,
  onSelect,
  onClose,
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
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />

          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-secondary">
              {t('onboarding.vehicle.import.pickTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              className="active:opacity-60"
            >
              <MaterialIcons name="close" size={22} color={colors.secondary} />
            </Pressable>
          </View>

          <Text className="mt-1.5 text-xs leading-4 text-muted">
            {t('onboarding.vehicle.import.pickSubtitle')}
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            // Capped so a long list scrolls instead of pushing the sheet past
            // the top of the screen.
            style={{ maxHeight: 400 }}
          >
            <View className="gap-3 py-4">
              {vehicles.map(vehicle => (
                <Pressable
                  key={vehicle._id}
                  onPress={() => onSelect(vehicle)}
                  className="flex-row items-center rounded-2xl border border-border px-4 py-3.5 active:bg-surface"
                >
                  {/* The old photo makes the choice obvious in a way a
                      registration number doesn't; the icon stands in for the
                      records that have none. */}
                  {vehicle.vehicleImageUrls[0] ? (
                    <Image
                      source={{ uri: vehicle.vehicleImageUrls[0] }}
                      className="h-11 w-11 rounded-xl"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-surface">
                      <MaterialIcons
                        name="directions-car"
                        size={22}
                        color={colors.tertiary}
                      />
                    </View>
                  )}
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-secondary">
                      {vehicle.registrationNumber ??
                        t('onboarding.vehicle.import.noNumber')}
                    </Text>
                    <Text className="mt-0.5 text-xs font-medium text-muted">
                      {[vehicle.vehicleType, vehicle.yearOfManufacture]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="chevron-right"
                    size={22}
                    color={colors.muted}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
