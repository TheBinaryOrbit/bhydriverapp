import React from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { colors } from '../../theme/colors';

export type MenuRow = {
  key: string;
  label: string;
  /** Icon name; `iconSet` decides which family it comes from. */
  icon: string;
  /** Content pages ship MaterialCommunityIcons names; app rows use MaterialIcons. */
  iconSet?: 'material' | 'community';
  /** Right-hand status text, e.g. the saved UPI id or vehicle count. */
  value?: string;
  /** Colors `value` when it reports a state rather than just echoing data. */
  valueTone?: 'muted' | 'success' | 'warning';
  onPress: () => void;
};

const VALUE_TONES = {
  muted: colors.muted,
  success: colors.success,
  warning: colors.warning,
} as const;

type Props = {
  title: string;
  rows: MenuRow[];
};

/** Titled card of tappable rows — the profile screen's navigation blocks. */
export default function MenuSection({ title, rows }: Props) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <View className="mt-5">
      <Text className="mb-2 ml-1 text-xs font-bold uppercase tracking-wide text-muted">
        {title}
      </Text>

      <View
        className="overflow-hidden rounded-2xl border border-border bg-white"
        style={CARD_SHADOW}
      >
        {rows.map((row, index) => (
          <Pressable
            key={row.key}
            onPress={row.onPress}
            className={`flex-row items-center px-4 py-4 active:bg-surface ${
              index > 0 ? 'border-t border-border' : ''
            }`}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-surface">
              {row.iconSet === 'community' ? (
                <MaterialCommunityIcons
                  name={row.icon}
                  size={19}
                  color={colors.secondary}
                />
              ) : (
                <MaterialIcons
                  name={row.icon}
                  size={19}
                  color={colors.secondary}
                />
              )}
            </View>

            <Text className="ml-3 flex-1 text-[15px] font-semibold text-secondary">
              {row.label}
            </Text>

            {row.value ? (
              <Text
                className="ml-2 max-w-[40%] text-xs font-semibold"
                style={{ color: VALUE_TONES[row.valueTone ?? 'muted'] }}
                numberOfLines={1}
              >
                {row.value}
              </Text>
            ) : null}

            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.indicatorBorder}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 1,
} as const;
