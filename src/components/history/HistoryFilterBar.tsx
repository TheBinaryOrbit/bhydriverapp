import React from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';

type Props = {
  /** Label for the active date preset, already translated. */
  dateLabel: string;
  /** Label for the status selection — "All rides", a name, or "2 selected". */
  statusLabel: string;
  dateActive: boolean;
  statusActive: boolean;
  /** Both pills open the same sheet; they only differ in what they report. */
  onOpen: () => void;
  onClear: () => void;
};

/**
 * The two things a driver filters history by, always visible so the current
 * query is never a mystery. Tapping either pill opens the same sheet — they are
 * a summary of the filter, not two separate controls.
 */
export default function HistoryFilterBar({
  dateLabel,
  statusLabel,
  dateActive,
  statusActive,
  onOpen,
  onClear,
}: Props) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center px-5 pb-3 pt-4">
      <FilterPill
        icon="event"
        label={dateLabel}
        active={dateActive}
        onPress={onOpen}
      />
      <View className="w-2" />
      <FilterPill
        icon="filter-list"
        label={statusLabel}
        active={statusActive}
        onPress={onOpen}
      />

      <View className="flex-1" />

      {dateActive || statusActive ? (
        <Pressable
          onPress={onClear}
          hitSlop={10}
          className="ml-2 flex-row items-center active:opacity-60"
        >
          <MaterialIcons name="close" size={15} color={colors.muted} />
          <Text className="ml-1 text-xs font-bold text-muted">
            {t('history.filter.clear')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterPill({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const tint = active ? colors.tertiary : colors.muted;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-full border px-3 py-2 active:opacity-70"
      style={{ borderColor: active ? colors.tertiary : colors.border }}
    >
      <MaterialIcons name={icon} size={14} color={tint} />
      <Text
        className="mx-1.5 text-xs font-bold"
        style={{ color: tint }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <MaterialIcons name="expand-more" size={15} color={tint} />
    </Pressable>
  );
}
