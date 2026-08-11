import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { colors } from '../theme/colors';

export type SegmentedTab<T extends string> = {
  key: T;
  label: string;
  /** MaterialIcons name shown before the label. */
  icon?: string;
  /**
   * How many things are waiting on this tab. Drawn as a red circle pinned to
   * the segment's top-right corner; `0` and `undefined` draw nothing.
   */
  badge?: number;
};

type Props<T extends string> = {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (key: T) => void;
  /**
   * `onNavy` sits on the deep-navy header — a white pill on a translucent
   * track. `onLight` is the same control on a white surface.
   */
  tone?: 'onNavy' | 'onLight';
};

/** Pill switch for top-level modes, sized for two or three segments. */
export default function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  tone = 'onNavy',
}: Props<T>) {
  const onNavy = tone === 'onNavy';

  return (
    <View
      className="flex-row rounded-full p-1"
      style={{
        backgroundColor: onNavy ? 'rgba(255,255,255,0.14)' : colors.surface,
      }}
    >
      {tabs.map(tab => {
        const active = tab.key === value;
        const tint = active
          ? onNavy
            ? colors.secondary
            : colors.primary
          : onNavy
            ? 'rgba(255,255,255,0.75)'
            : colors.muted;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            className={`flex-1 flex-row items-center justify-center rounded-full py-2.5 ${
              active ? '' : 'active:opacity-70'
            }`}
            style={{
              backgroundColor: active
                ? onNavy
                  ? colors.primary
                  : colors.secondary
                : 'transparent',
            }}
          >
            {tab.icon ? (
              <MaterialIcons name={tab.icon} size={16} color={tint} />
            ) : null}
            <Text
              className={`text-sm ${active ? 'font-extrabold' : 'font-semibold'} ${
                tab.icon ? 'ml-1.5' : ''
              }`}
              style={{ color: tint }}
              numberOfLines={1}
            >
              {tab.label}
            </Text>

            {/* Absolutely positioned so it hangs in the corner without moving
                the icon and label, which stay centred in the segment whether
                or not there is anything to count. */}
            {tab.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText} numberOfLines={1}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Inset from the segment's own corner rather than hung outside it: the pill
   * is the last thing in the track and a negative offset would push the circle
   * over the rounded edge of it.
   */
  badge: {
    position: 'absolute',
    top: 1,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
});
