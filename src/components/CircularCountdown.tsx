import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  /** How long the countdown runs, in seconds. Restart it by changing `key`. */
  seconds: number;
  size?: number;
  /** Ring thickness. */
  stroke?: number;
  color?: string;
  trackColor?: string;
  /** Painted into the donut hole — match whatever sits behind the ring. */
  backgroundColor?: string;
};

/**
 * Draining ring with the seconds remaining in the middle.
 *
 * The project has no `react-native-svg`, so the arc is two half-discs rotated
 * about the circle's centre and clipped to one half each: the right one sweeps
 * the first 180°, the left one the rest. A background-coloured circle on top
 * turns the disc into a ring.
 *
 * Ticks itself so the 10 re-renders a second stay inside this component.
 */
export default function CircularCountdown({
  seconds,
  size = 128,
  stroke = 8,
  color = colors.tertiary,
  trackColor = colors.border,
  backgroundColor = colors.primary,
}: Props) {
  const totalMs = seconds * 1000;
  const [remaining, setRemaining] = useState(totalMs);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, totalMs - (Date.now() - startedAt));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
      }
    }, 100);

    return () => clearInterval(id);
  }, [totalMs]);

  const half = size / 2;
  const swept = (remaining / totalMs) * 360;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: half,
          backgroundColor: trackColor,
        }}
      />

      <Wedge
        side="right"
        angle={Math.min(swept, 180)}
        size={size}
        color={color}
      />
      <Wedge
        side="left"
        angle={Math.max(0, swept - 180)}
        size={size}
        color={color}
      />

      <View
        style={{
          position: 'absolute',
          top: stroke,
          left: stroke,
          width: size - stroke * 2,
          height: size - stroke * 2,
          borderRadius: half - stroke,
          backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          className="font-bold text-secondary"
          style={{ fontSize: size * 0.3 }}
        >
          {Math.ceil(remaining / 1000)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Half the circle, clipped to `side`, holding the *opposite* half-disc rotated
 * clockwise by `angle`. At 0° the disc sits entirely outside the clip and
 * nothing shows; at 180° it lands exactly on top of it and the half is full.
 */
function Wedge({
  side,
  angle,
  size,
  color,
}: {
  side: 'left' | 'right';
  angle: number;
  size: number;
  color: string;
}) {
  const half = size / 2;
  const isRight = side === 'right';

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: isRight ? half : 0,
        width: half,
        height: size,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          // Parked on the far side of the clip, so it only enters as it turns.
          left: isRight ? -half : half,
          width: half,
          height: size,
          backgroundColor: color,
          // Only the outer edge is round — the inner one is the diameter.
          borderTopLeftRadius: isRight ? half : 0,
          borderBottomLeftRadius: isRight ? half : 0,
          borderTopRightRadius: isRight ? 0 : half,
          borderBottomRightRadius: isRight ? 0 : half,
          // The circle's centre is the disc's inner edge.
          transformOrigin: isRight ? '100% 50%' : '0% 50%',
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    </View>
  );
}
