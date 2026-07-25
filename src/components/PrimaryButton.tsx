import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { colors, navyGradient, navyGradientMuted } from '../theme/colors';

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
  // Loading stays visually "live" — a greyed-out button with a spinner in it
  // reads as broken rather than busy.
  const muted = disabled && !loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      // No opacity while disabled: on Android an `opacity` parent renders the
      // child's elevation shadow into a separate layer and clips it, which is
      // what produced the half-cut light rectangle behind the button.
      className={`${isDisabled ? '' : 'active:opacity-90'} ${className}`}
    >
      <LinearGradient
        colors={muted ? navyGradientMuted : navyGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.body, muted ? styles.flat : styles.raised]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View className="flex-row items-center">
            <Text
              className="text-lg font-bold text-white"
              style={muted ? styles.mutedLabel : undefined}
            >
              {label}
            </Text>
            {icon ? (
              <MaterialIcons
                name={icon}
                size={20}
                color={muted ? 'rgba(255, 255, 255, 0.85)' : colors.primary}
                style={styles.icon}
              />
            ) : null}
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Android draws the elevation shadow from the view's outline, so this needs
    // a real background colour. Left transparent, the shadow degrades into a
    // grey box that ignores `borderRadius`. The gradient paints over it.
    backgroundColor: colors.secondary,
  },
  raised: {
    shadowColor: colors.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  /** A disabled button sits flat on the surface — nothing to lift. */
  flat: {
    backgroundColor: navyGradientMuted[0],
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  mutedLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  icon: {
    marginLeft: 8,
  },
});
