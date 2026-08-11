import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { colors, navyGradient } from '../../theme/colors';
import { rupees } from './format';

type Props = {
  /** `bidBounds.min` — the server rejects anything below it. */
  min: number;
  /** `bidBounds.max`. */
  max: number;
  value: number;
  onChange: (value: number) => void;
  /** Rupee granularity of the drag and the stepper buttons. */
  step?: number;
  disabled?: boolean;
};

/**
 * The bid slider, built on `PanResponder` because the project carries no
 * slider dependency.
 *
 * The gesture works off `dx` from the value captured on touch-down rather than
 * absolute page coordinates, so it stays accurate wherever the track sits
 * without measuring its position on screen.
 *
 * It lives inside a scrolling list of ride cards, which is what shapes the rest
 * of the gesture: nothing is committed on touch-down, and the responder is
 * given up freely until the drag proves horizontal. A driver flicking the list
 * with a thumb that happens to land on a track scrolls, and their fare is
 * exactly where they left it.
 */
export default function FareSlider({
  min,
  max,
  value,
  onChange,
  step = 10,
  disabled = false,
}: Props) {
  const [width, setWidth] = useState(0);

  const widthRef = useRef(0);
  const startRef = useRef(value);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  const rangeRef = useRef({ min, max, step });
  rangeRef.current = { min, max, step };

  /** Where the finger went down, for the tap-to-jump decided on release. */
  const tapRef = useRef(0);
  /** The drag has committed to being horizontal, so it is ours to finish. */
  const dragging = useRef(false);

  const clampToStep = (raw: number) => {
    const { min: lo, max: hi, step: grain } = rangeRef.current;
    const snapped = Math.round(raw / grain) * grain;
    return Math.min(Math.max(snapped, lo), hi);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        // Sideways only. A vertical drag belongs to the list under this card.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !disabled && Math.abs(gesture.dx) > Math.abs(gesture.dy),

        // Nothing moves yet: on touch-down we only remember where the finger
        // landed and what the fare was, so a scroll that starts here costs the
        // driver nothing.
        onPanResponderGrant: event => {
          startRef.current = valueRef.current;
          tapRef.current = event.nativeEvent.locationX;
          dragging.current = false;
        },

        /**
         * Holding the responder must not cost the list its scroll. Until the
         * drag proves horizontal, anyone who asks for the gesture can have it;
         * after that it is refused, so a drag can't be yanked away halfway.
         */
        onPanResponderTerminationRequest: () => !dragging.current,

        onPanResponderMove: (_event, gesture) => {
          const track = widthRef.current;
          if (!track) {
            return;
          }
          if (
            !dragging.current &&
            Math.abs(gesture.dx) > 4 &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy)
          ) {
            dragging.current = true;
          }
          if (!dragging.current) {
            return;
          }
          const { min: lo, max: hi } = rangeRef.current;
          const delta = (gesture.dx / track) * (hi - lo);
          changeRef.current(clampToStep(startRef.current + delta));
        },

        // A tap that never became a drag jumps the fare to where it landed;
        // `locationX` is relative to the track because the track is the
        // responder.
        onPanResponderRelease: () => {
          const track = widthRef.current;
          if (dragging.current || !track) {
            dragging.current = false;
            return;
          }
          const { min: lo, max: hi } = rangeRef.current;
          const ratio = Math.min(Math.max(tapRef.current / track, 0), 1);
          changeRef.current(clampToStep(lo + ratio * (hi - lo)));
        },

        onPanResponderTerminate: () => {
          dragging.current = false;
        },
      }),
    // `disabled` is the only thing the responder itself branches on; every
    // other input is read through a ref so the gesture never goes stale.
    [disabled],
  );

  const span = Math.max(max - min, 1);
  const ratio = Math.min(Math.max((value - min) / span, 0), 1);
  const filled = width * ratio;

  const nudge = (direction: 1 | -1) => {
    if (disabled) {
      return;
    }
    onChange(clampToStep(value + direction * step));
  };

  return (
    <View>
      <View className="flex-row items-center">
        <StepButton
          icon="remove"
          onPress={() => nudge(-1)}
          disabled={disabled || value <= min}
        />

        <View className="mx-3 flex-1 items-center">
          <Text className="text-2xl font-extrabold text-secondary">
            {rupees(value)}
          </Text>
        </View>

        <StepButton
          icon="add"
          onPress={() => nudge(1)}
          disabled={disabled || value >= max}
        />
      </View>

      <View
        className="mt-3.5 justify-center"
        style={styles.hitArea}
        onLayout={event => {
          const next = event.nativeEvent.layout.width;
          widthRef.current = next;
          setWidth(next);
        }}
        {...responder.panHandlers}
      >
        <View className="h-1.5 rounded-full bg-border" />

        <LinearGradient
          colors={navyGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: filled }]}
        />

        <View
          style={[
            styles.knob,
            // Half the knob, so its centre tracks the value rather than its edge.
            { left: Math.max(filled - 12, 0) },
            disabled ? styles.knobDisabled : null,
          ]}
        />
      </View>

      <View className="mt-2 flex-row justify-between">
        <Text className="text-[11px] font-semibold text-muted">
          {rupees(min)}
        </Text>
        <Text className="text-[11px] font-semibold text-muted">
          {rupees(max)}
        </Text>
      </View>
    </View>
  );
}

function StepButton({
  icon,
  onPress,
  disabled,
}: {
  icon: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className={`h-9 w-9 items-center justify-center rounded-full border border-border ${
        disabled ? 'opacity-40' : 'active:bg-surface'
      }`}
    >
      <MaterialIcons name={icon} size={20} color={colors.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Taller than the track so the thumb is comfortable to grab. */
  hitArea: {
    height: 30,
  },
  fill: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
  },
  knob: {
    position: 'absolute',
    height: 24,
    width: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.tertiary,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  knobDisabled: {
    borderColor: colors.indicatorBorder,
  },
});
