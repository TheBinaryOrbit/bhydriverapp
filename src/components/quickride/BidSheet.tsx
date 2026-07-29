import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import FareSlider from './FareSlider';
import RouteLine from './RouteLine';
import { distance, duration, rupees, summaryLine } from './format';
import PrimaryButton from '../PrimaryButton';
import type { PendingBid } from '../../hooks/useQuickRide';
import { colors } from '../../theme/colors';
import type { RideCard } from '../../types/quickRide';

type Props = {
  card: RideCard | null;
  /** The standing bid, when the driver is lowering rather than opening one. */
  bid?: PendingBid;
  submitting: boolean;
  /** Message from a rejected bid — bounds, or "you can only lower". */
  error: string | null;
  onSubmit: (fare: number) => void;
  onClose: () => void;
};

/**
 * Bottom sheet for placing or lowering a bid.
 *
 * The ceiling is the interesting part: normally `bidBounds.max`, but a driver
 * who already has a bid on this ride can only undercut themselves, so it drops
 * to `currentBid - 1`. Enforcing that here means the obvious gesture can't
 * produce a `400`.
 */
export default function BidSheet({
  card,
  bid,
  submitting,
  error,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const bounds = card?.bidBounds;
  const lowering = bid?.status === 'pending' && typeof bid.fare === 'number';

  const { min, max } = useMemo(() => {
    const low = bounds?.min ?? 0;
    const high = bounds?.max ?? card?.offeredFare ?? low;
    // Re-bidding replaces the old bid and must come in lower.
    return { min: low, max: lowering ? Math.max(low, bid!.fare - 1) : high };
  }, [bid, bounds, card?.offeredFare, lowering]);

  const [fare, setFare] = useState(min);

  // Reset whenever the sheet opens on a different ride, or the rider raises the
  // offer and the bounds move under it.
  useEffect(() => {
    if (!card) {
      return;
    }
    const suggested = lowering ? max : (card.offeredFare ?? max);
    setFare(Math.min(Math.max(suggested, min), max));
  }, [card, lowering, max, min]);

  // Nothing to offer: the driver already bid the floor.
  const exhausted = lowering && max <= min;

  return (
    <Modal
      visible={card !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        {/* Swallows taps so the sheet itself doesn't dismiss. */}
        <Pressable
          className="rounded-t-3xl bg-white px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
          onPress={() => {}}
        >
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />

          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-secondary">
              {lowering ? t('quickRide.lowerBidTitle') : t('quickRide.bidTitle')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
              <MaterialIcons name="close" size={22} color={colors.secondary} />
            </Pressable>
          </View>

          {card ? (
            <>
              <View className="mt-4 rounded-2xl border border-border bg-surface p-4">
                <RouteLine
                  pickup={card.pickupLocationName}
                  drop={card.dropLocationName}
                />
                <Text className="mt-3 text-xs font-semibold text-muted">
                  {summaryLine([
                    distance(card.estimatedDistanceKm),
                    duration(card.estimatedDurationMin),
                    t('quickRide.offered', {
                      amount: rupees(card.offeredFare),
                    }),
                  ])}
                </Text>
              </View>

              {exhausted ? (
                <View className="mt-5 rounded-xl bg-warning/10 px-4 py-3">
                  <Text
                    className="text-xs leading-5"
                    style={{ color: colors.warning }}
                  >
                    {t('quickRide.cannotLower', { amount: rupees(bid!.fare) })}
                  </Text>
                </View>
              ) : (
                <>
                  <Text className="mt-6 text-center text-xs font-bold uppercase tracking-wide text-muted">
                    {t('quickRide.yourFare')}
                  </Text>

                  <View className="mt-2">
                    <FareSlider
                      min={min}
                      max={max}
                      value={fare}
                      onChange={setFare}
                      disabled={submitting}
                    />
                  </View>

                  <View className="mt-4 flex-row justify-center">
                    <QuickPick
                      label={t('quickRide.lowest')}
                      onPress={() => setFare(min)}
                      active={fare === min}
                    />
                    {lowering ? null : (
                      <QuickPick
                        label={t('quickRide.matchOffer')}
                        onPress={() =>
                          setFare(
                            Math.min(Math.max(card.offeredFare ?? max, min), max),
                          )
                        }
                        active={fare === card.offeredFare}
                      />
                    )}
                    <QuickPick
                      label={t('quickRide.highest')}
                      onPress={() => setFare(max)}
                      active={fare === max}
                    />
                  </View>
                </>
              )}

              {error ? (
                <View className="mt-4 flex-row items-start rounded-xl px-4 py-3"
                  style={{ backgroundColor: colors.dangerSurface }}
                >
                  <MaterialIcons
                    name="error-outline"
                    size={15}
                    color={colors.danger}
                    style={{ marginTop: 1 }}
                  />
                  <Text
                    className="ml-2 flex-1 text-xs leading-5"
                    style={{ color: colors.danger }}
                  >
                    {error}
                  </Text>
                </View>
              ) : null}

              <PrimaryButton
                className="mt-6"
                label={
                  lowering
                    ? t('quickRide.confirmLower', { amount: rupees(fare) })
                    : t('quickRide.confirmBid', { amount: rupees(fare) })
                }
                icon="check"
                loading={submitting}
                disabled={exhausted}
                onPress={() => onSubmit(fare)}
              />

              <Text className="mt-3 text-center text-[11px] leading-4 text-muted">
                {t('quickRide.bidNote')}
              </Text>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function QuickPick({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mx-1 rounded-full border px-4 py-2 active:opacity-70 ${
        active ? 'border-tertiary bg-tertiary/10' : 'border-border'
      }`}
    >
      <Text
        className="text-xs font-bold"
        style={{ color: active ? colors.tertiary : colors.muted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
