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
};

/** Pickup → drop, joined by the dotted connector used across the ride surfaces. */
export default function RouteLine({
  pickup,
  drop,
  emphasis = 'both',
  hideDrop = false,
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
      />

      {hideDrop ? null : (
        <>
          <View className="my-1 ml-[5px] flex-row">
            <View
              className="w-0.5 rounded-full"
              style={{ height: 18, backgroundColor: colors.indicatorBorder }}
            />
          </View>
          <Leg color={colors.tertiary} label={drop} dim={dropDim} shape="square" />
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
}: {
  color: string;
  label?: string;
  dim: boolean;
  shape: 'dot' | 'square';
}) {
  return (
    <View className="flex-row items-start">
      <View
        className={shape === 'dot' ? 'rounded-full' : 'rounded-[2px]'}
        style={{
          width: 12,
          height: 12,
          marginTop: 3,
          backgroundColor: color,
          opacity: dim ? 0.4 : 1,
        }}
      />
      <Text
        className={`ml-3 flex-1 text-[15px] font-semibold ${
          dim ? 'text-muted' : 'text-secondary'
        }`}
        numberOfLines={2}
      >
        {label ?? '—'}
      </Text>
    </View>
  );
}
