import React from 'react';
import { Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type Props = {
  pickup?: string;
  drop?: string;
  /**
   * Dims the leg the driver is done with. `pickup` while heading to the rider,
   * `drop` once the trip is running — the details screen shows one destination
   * at a time and this is how the other one steps back.
   */
  emphasis?: 'both' | 'pickup' | 'drop';
  /** Hide the drop leg entirely (the `assigned` phase shows pickup only). */
  hideDrop?: boolean;
  /**
   * Tighter type and a shorter connector, for the offer cards — a driver
   * scanning a list is deciding on the fare and the distances, and reads the
   * street names once they have. The trip screens keep the full size, where the
   * address is the thing being navigated to.
   */
  compact?: boolean;
};

/** Pickup → drop, joined by the dotted connector used across the ride surfaces. */
export default function RouteLine({
  pickup,
  drop,
  emphasis = 'both',
  hideDrop = false,
  compact = false,
}: Props) {
  const pickupDim = emphasis === 'drop';
  const dropDim = emphasis === 'pickup';

  return (
    <View>
      <Leg
        color={colors.success}
        label={pickup}
        dim={pickupDim}
        shape="dot"
        compact={compact}
      />

      {hideDrop ? null : (
        <>
          <View className="my-1 ml-[5px] flex-row">
            <View
              className="w-0.5 rounded-full"
              style={{
                height: compact ? 13 : 18,
                backgroundColor: colors.indicatorBorder,
              }}
            />
          </View>
          <Leg
            color={colors.tertiary}
            label={drop}
            dim={dropDim}
            shape="square"
            compact={compact}
          />
        </>
      )}
    </View>
  );
}

function Leg({
  color,
  label,
  dim,
  shape,
  compact,
}: {
  color: string;
  label?: string;
  dim: boolean;
  shape: 'dot' | 'square';
  compact: boolean;
}) {
  const size = compact ? 10 : 12;

  return (
    <View className="flex-row items-start">
      <View
        className={shape === 'dot' ? 'rounded-full' : 'rounded-[2px]'}
        style={{
          width: size,
          height: size,
          marginTop: compact ? 2 : 3,
          backgroundColor: color,
          opacity: dim ? 0.4 : 1,
        }}
      />
      <Text
        className={`flex-1 font-semibold ${compact ? 'ml-2.5 text-[13px]' : 'ml-3 text-[15px]'} ${
          dim ? 'text-muted' : 'text-secondary'
        }`}
        numberOfLines={2}
      >
        {label ?? '—'}
      </Text>
    </View>
  );
}
