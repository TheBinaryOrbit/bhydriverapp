import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
  /** Classes for the screen container (e.g. background color). */
  className?: string;
  /** Apply the top viewport inset as padding. Default true. */
  top?: boolean;
  /** Apply the bottom viewport inset as padding. Default true. */
  bottom?: boolean;
};

/**
 * Full-height screen container that pads content by the device's safe-area
 * insets (status bar at the top, home indicator / nav bar at the bottom) using
 * the viewport insets from `useSafeAreaInsets`.
 */
export default function Screen({
  children,
  className = '',
  top = true,
  bottom = true,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={`flex-1 ${className}`}
      style={{
        paddingTop: top ? insets.top : 0,
        paddingBottom: bottom ? insets.bottom : 0,
      }}
    >
      {children}
    </View>
  );
}
