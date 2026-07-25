import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { colors, navyGradient } from '../theme/colors';

type Props = {
  label: string;
  onPress: () => void;
  /** MaterialIcons name shown after the label. */
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Extra classes on the outer Pressable (e.g. margins). */
  className?: string;
};

/**
 * Full-width navy-gradient action button used across the auth flow.
 * Mirrors the example's Verify/Send button (label + trailing icon + spinner).
 */
export default function PrimaryButton({
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
  className = '',
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`active:opacity-90 ${isDisabled ? 'opacity-60' : ''} ${className}`}
    >
      <LinearGradient
        colors={navyGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height: 56,
          borderRadius: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.secondary,
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View className="flex-row items-center">
            <Text className="text-lg font-bold text-white">{label}</Text>
            {icon ? (
              <MaterialIcons
                name={icon}
                size={20}
                color={colors.primary}
                style={{ marginLeft: 8 }}
              />
            ) : null}
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}
