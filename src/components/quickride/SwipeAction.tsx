import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { colors } from '../../theme/colors';

/**
 * Slide-to-confirm, for the two actions that cost the driver money.
 *
 * A bid is a commitment — it is money, it is sixty seconds of the driver's
 * availability, and it cannot be raised afterwards. These cards arrive
 * unannounced while a phone is in a cradle in a moving car, and a tap-sized
 * target in that setting is a bid placed by a pothole. The gesture takes an
 * intentional 75% of the track before it fires.
 *
 * Built on `PanResponder` for the same reason `FareSlider` is: the project
 * carries no gesture dependency wired into the app root. It claims the gesture
 * only once the drag is clearly horizontal, so the card can still be scrolled
 * by dragging across the control.
 */

const TRACK_H = 56;
const KNOB = 48;
const PAD = 4;
/** How much of the track has to be crossed for the swipe to count. */
const COMMIT = 0.75;

type Props = {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** The action is running — the knob parks at the end and spins. */
  loading?: boolean;
  /** Track colour. Defaults to the orange accent. */
  tone?: string;
  /** Icon in the knob at rest. */
  icon?: string;
};

export default function SwipeAction({
  label,
  onConfirm,
  disabled = false,
  loading = false,
  tone = colors.tertiary,
  icon = 'arrow-forward',
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);

  const x = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(0);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  // Read inside the responder, which is built once per `frozen` change.
  const frozen = disabled || loading;
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  const travel = () => Math.max(widthRef.current - KNOB - PAD * 2, 1);

  const settle = () =>
    Animated.spring(x, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
      speed: 18,
    }).start();

  // The action finished — hand the control back. Covers the failed submit,
  // where the sheet stays open and the driver has to be able to try again.
  useEffect(() => {
    if (!loading) {
      settle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /** The drag has committed to being horizontal, so it is ours to finish. */
  const dragging = useRef(false);

  const responder = useMemo(
    () =>
      PanResponder.create({
        /**
         * On touch-down, not on move.
         *
         * Waiting for the move looks tidier but does not work inside the bid
         * sheet: the sheet is a `Pressable`, it takes the responder on
         * touch-down, and React Native then restarts move-negotiation at the
         * lowest common ancestor of the responder and the touch target — which
         * is the sheet itself. Everything below it, this track included, is
         * never asked. Claiming first is the only way down there.
         */
        onStartShouldSetPanResponder: () => !frozenRef.current,
        onMoveShouldSetPanResponder: () => !frozenRef.current,

        onPanResponderGrant: () => {
          dragging.current = false;
        },

        /**
         * Holding the responder must not cost the list its scroll. Until the
         * drag proves horizontal, anyone who asks for the gesture can have it;
         * after that it is refused, so a swipe can't be yanked away halfway.
         */
        onPanResponderTerminationRequest: () => !dragging.current,

        onPanResponderMove: (_event, gesture) => {
          if (
            !dragging.current &&
            gesture.dx > 6 &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy)
          ) {
            dragging.current = true;
          }
          if (!dragging.current) {
            return;
          }
          x.setValue(Math.min(Math.max(gesture.dx, 0), travel()));
        },

        onPanResponderRelease: (_event, gesture) => {
          const end = travel();
          // A tap, or a drag that never went sideways. Nothing was committed.
          if (!dragging.current || gesture.dx < end * COMMIT) {
            dragging.current = false;
            settle();
            return;
          }
          dragging.current = false;
          Animated.timing(x, {
            toValue: end,
            duration: 110,
            useNativeDriver: true,
          }).start(() => {
            confirmRef.current();
            // Whatever this fired may or may not raise `loading`. Give it a
            // beat to say so; if it didn't, the swipe is over and the knob
            // comes home on its own.
            setTimeout(() => {
              if (!frozenRef.current) {
                settle();
              }
            }, 350);
          });
        },

        onPanResponderTerminate: () => {
          dragging.current = false;
          settle();
        },
      }),
    // Everything else is read through a ref so the gesture never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Hand the label to the knob as it crosses — by the commit point the driver
  // is reading the gesture, not the words.
  const labelOpacity = x.interpolate({
    inputRange: [0, Math.max(trackWidth * 0.5, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      onLayout={event => {
        const next = event.nativeEvent.layout.width;
        widthRef.current = next;
        setTrackWidth(next);
      }}
      style={[
        styles.track,
        { backgroundColor: tone, opacity: disabled ? 0.5 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: frozen, busy: loading }}
      accessibilityLabel={label}
      // A screen reader cannot swipe; activating the label does the same thing.
      accessible
      onAccessibilityTap={() => {
        if (!frozen) {
          confirmRef.current();
        }
      }}
      {...responder.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.labelRow, { opacity: labelOpacity }]}
      >
        <Text className="text-[15px] font-bold text-white">{label}</Text>
        <MaterialIcons
          name="double-arrow"
          size={16}
          color="rgba(255,255,255,0.75)"
          style={styles.chevrons}
        />
      </Animated.View>

      <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]}>
        {loading ? (
          <ActivityIndicator size="small" color={tone} />
        ) : (
          <MaterialIcons name={icon} size={22} color={tone} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  labelRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Clear of the parked knob, so the label sits centred in what's left.
    paddingLeft: KNOB,
  },
  chevrons: {
    marginLeft: 6,
  },
  knob: {
    position: 'absolute',
    left: PAD,
    height: KNOB,
    width: KNOB,
    borderRadius: KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
