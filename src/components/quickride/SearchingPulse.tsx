import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { colors } from '../../theme/colors';

/**
 * The "listening for rides" mark — a car with two rings sweeping out of it.
 *
 * A spinner would say *loading*, and nothing is loading: the driver is online,
 * the socket is open, and the app is simply waiting for a rider somewhere
 * nearby to book. The radar says that instead, and it says it without ever
 * looking stuck, which a spinner sitting there for ten minutes does.
 */

const FIELD = 132;
const CORE = 64;
/** One sweep. Slow on purpose — this thing may be on screen for a long time. */
const SWEEP_MS = 2200;

export default function SearchingPulse() {
  return (
    <View
      style={{ height: FIELD, width: FIELD }}
      className="items-center justify-center"
    >
      <Ring delay={0} />
      <Ring delay={SWEEP_MS / 2} />

      <View
        style={{
          height: CORE,
          width: CORE,
          borderRadius: CORE / 2,
          backgroundColor: colors.surface,
        }}
        className="items-center justify-center"
      >
        <MaterialIcons name="local-taxi" size={30} color={colors.tertiary} />
      </View>
    </View>
  );
}

/** One expanding circle. Two of these, half a sweep apart, read as a radar. */
function Ring({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );

    // Staggering with a plain timer rather than `Animated.delay` inside the
    // loop: a delay in the sequence would also gap every iteration after the
    // first, and the rings would pulse rather than sweep.
    const timer = setTimeout(() => loop.start(), delay);

    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [anim, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        height: FIELD,
        width: FIELD,
        borderRadius: FIELD / 2,
        borderWidth: 1.5,
        borderColor: colors.tertiary,
        opacity: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.45, 0],
        }),
        transform: [
          {
            scale: anim.interpolate({
              inputRange: [0, 1],
              // Starts flush with the car, ends at the edge of the field.
              outputRange: [CORE / FIELD, 1],
            }),
          },
        ],
      }}
    />
  );
}
