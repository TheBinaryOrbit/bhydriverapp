import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import FareSlider from './FareSlider';
import SwipeAction from './SwipeAction';
import { rupees } from './format';
import { colors } from '../../theme/colors';
import type { BidBounds } from '../../types/quickRide';

type Props = {
  /** Identifies the offer, so one ride's bounds can't be reused for another. */
  rideId: string;
  bounds?: BidBounds;
  offeredFare?: number;
  /**
   * The standing bid, when the driver is lowering rather than opening one. A
   * bid can only ever be undercut, so this becomes the ceiling.
   */
  currentBid?: number;
  /** This card's bid is in flight — the swipe parks and spins. */
  submitting?: boolean;
  /** Message from a rejected bid, shown under the slider. */
  error?: string | null;
  disabled?: boolean;
  /** Small print under the swipe — the 60s rule, or outstation's. */
  note?: string;
  onSubmit: (fare: number) => void;
};

/**
 * Pick a fare and commit to it, in the card itself.
 *
 * This used to be a bottom sheet. It isn't any more: a ride card has a life of
 * sixty seconds, and spending two of them opening a modal to reach a slider —
 * on a phone in a cradle, in traffic — cost the driver rides. The slider, the
 * range and the swipe now sit where the offer is.
 *
 * The ceiling is the interesting part: normally `bounds.max`, but a driver who
 * already has a bid here can only undercut themselves, so it drops to
 * `currentBid - 1`. Enforcing that here means the obvious gesture can't produce
 * a `400`.
 */
export default function BidControl({
  rideId,
  bounds: rawBounds,
  offeredFare,
  currentBid,
  submitting = false,
  error,
  disabled = false,
  note,
  onSubmit,
}: Props) {
  const { t } = useTranslation();

  const bounds = useStickyBounds(rideId, rawBounds);
  const lowering = typeof currentBid === 'number';

  const min = bounds?.min ?? 0;
  const ceiling = bounds?.max ?? offeredFare ?? min;
  const max = lowering ? Math.max(min, currentBid - 1) : ceiling;

  // Opening a bid starts at what the rider offered — taking the offer as it
  // stands is the common move, and undercutting is a drag away. Lowering starts
  // at the best undercut, which is what the clamp lands on.
  const [fare, setFare] = useState(() => clamp(offeredFare ?? max, min, max));

  // The rider can raise their offer, or a bid of ours can move the ceiling,
  // while this is on screen. Clamp rather than reset: a driver mid-decision
  // shouldn't have their chosen fare thrown away by a bounds nudge.
  useEffect(() => {
    setFare(previous => clamp(previous, min, max));
  }, [max, min]);

  // Nothing left to offer: the driver already bid the floor.
  if (lowering && max <= min) {
    return (
      <View
        className="rounded-xl px-4 py-3"
        style={{ backgroundColor: colors.warningSurface }}
      >
        <Text className="text-xs leading-5" style={{ color: colors.warning }}>
          {t('quickRide.cannotLower', { amount: rupees(currentBid) })}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text className="text-center text-[11px] font-bold uppercase tracking-wide text-muted">
        {t('quickRide.yourFare')}
      </Text>

      <View className="mt-1">
        <FareSlider
          min={min}
          max={max}
          value={fare}
          onChange={setFare}
          disabled={submitting || disabled}
        />
      </View>

      {error ? (
        <View
          className="mt-3 flex-row items-start rounded-xl px-3 py-2.5"
          style={{ backgroundColor: colors.dangerSurface }}
        >
          <MaterialIcons
            name="error-outline"
            size={14}
            color={colors.danger}
            style={{ marginTop: 1 }}
          />
          <Text
            className="ml-2 flex-1 text-[11px] leading-4"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        </View>
      ) : null}

      {/* Swiped, not tapped — this is the moment the money is committed, and it
          is one thumb-width from a slider the driver was just dragging. */}
      <View className="mt-4">
        <SwipeAction
          label={
            lowering
              ? t('quickRide.swipeToLower', { amount: rupees(fare) })
              : t('quickRide.swipeToConfirm', { amount: rupees(fare) })
          }
          icon="gavel"
          loading={submitting}
          disabled={disabled}
          onConfirm={() => onSubmit(fare)}
        />
      </View>

      {note ? (
        <Text className="mt-2.5 text-center text-[11px] leading-4 text-muted">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A range the driver can actually bid inside. `{ min: 0, max: 0 }` is not. */
function usable(bounds?: BidBounds | null): bounds is BidBounds {
  return (
    bounds != null &&
    typeof bounds.min === 'number' &&
    typeof bounds.max === 'number' &&
    bounds.max > bounds.min
  );
}

/**
 * The bid range, held for as long as the control is on the same ride.
 *
 * Bidding again after one expires must offer the range the driver bid inside
 * the first time. Left to the card alone it might not: a re-dispatch can arrive
 * without bounds, and the fallback below it — a floor of ₹0 and a ceiling of
 * whatever the rider offered — is a *different, wider* range that the server
 * would then reject. So the last usable bounds for this ride win.
 */
function useStickyBounds(
  rideId: string,
  bounds?: BidBounds,
): BidBounds | undefined {
  const held = useRef<{ rideId: string; bounds: BidBounds } | null>(null);

  if (usable(bounds)) {
    held.current = { rideId, bounds };
    return bounds;
  }
  return held.current?.rideId === rideId ? held.current.bounds : undefined;
}
