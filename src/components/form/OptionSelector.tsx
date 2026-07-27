import React from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { colors } from '../../theme/colors';

export type Option = {
  value: string;
  label: string;
  /** Optional icon name shown before the label. */
  icon?: string;
  /** Icon family for the option icon. */
  iconSet?: 'material' | 'community';
  /** Optional second line (e.g. a vehicle type's description). */
  caption?: string;
};

type Props = {
  label: string;
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  /** One option per row instead of wrapping chips. */
  stacked?: boolean;
  /**
   * Renders the chosen option alone, greyed and unpressable — the selector
   * equivalent of `FormField`'s `locked`, for values the driver can't change.
   */
  locked?: boolean;
  /** Small grey helper line under the options (hidden while `error` is set). */
  hint?: string;
  className?: string;
};

/** Chip / row selector used for gender and vehicle type. */
export default function OptionSelector({
  label,
  options,
  value,
  onChange,
  required = false,
  error,
  stacked = false,
  locked = false,
  hint,
  className = '',
}: Props) {
  // Nothing to show the driver if a locked value doesn't match any option, so
  // fall back to the full list rather than rendering an empty row.
  const shown = locked
    ? options.filter(option => option.value === value)
    : options;

  return (
    <View className={className}>
      <Text className="mb-2 text-sm font-semibold text-secondary">
        {label}
        {required ? <Text className="text-[#d92d20]"> *</Text> : null}
      </Text>

      <View className={stacked ? 'gap-2' : 'flex-row flex-wrap gap-2'}>
        {(shown.length > 0 ? shown : options).map(option => {
          const selected = option.value === value;
          const IconComponent =
            option.iconSet === 'community'
              ? MaterialCommunityIcons
              : MaterialIcons;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={locked}
              className={`flex-row items-center rounded-xl px-4 py-3 ${
                locked ? '' : 'active:opacity-80'
              } ${stacked ? 'w-full' : ''}`}
              // The screens these sit on are white, so an unselected chip needs
              // a tinted fill of its own — a white chip with a #e0e0e0 hairline
              // reads as no chip at all.
              style={{
                borderWidth: selected && !locked ? 2 : 1,
                borderColor: locked
                  ? colors.border
                  : selected
                    ? colors.secondary
                    : colors.indicatorBorder,
                backgroundColor:
                  selected && !locked ? '#eaf2f8' : colors.surface,
              }}
            >
              {option.icon ? (
                <IconComponent
                  name={option.icon}
                  size={18}
                  color={
                    locked
                      ? colors.muted
                      : selected
                        ? colors.secondary
                        : colors.muted
                  }
                  style={{ marginRight: 8, flexShrink: 0 }}
                />
              ) : null}

              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text
                  className={`text-sm ${locked ? 'text-muted' : 'text-secondary'} ${
                    selected && !locked ? 'font-bold' : 'font-medium'
                  }`}
                >
                  {option.label}
                </Text>
                {option.caption ? (
                  <Text className="mt-0.5 text-xs text-muted">
                    {option.caption}
                  </Text>
                ) : null}
              </View>

              {locked ? (
                <MaterialIcons
                  name="lock-outline"
                  size={16}
                  color={colors.muted}
                  style={{ marginLeft: stacked ? 'auto' : 6, flexShrink: 0 }}
                />
              ) : selected ? (
                <MaterialIcons
                  name="check-circle"
                  size={18}
                  color={colors.tertiary}
                  style={{ marginLeft: stacked ? 'auto' : 6, flexShrink: 0 }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text className="mt-1 text-xs font-medium text-[#d92d20]">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
