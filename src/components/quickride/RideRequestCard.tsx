import React from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { CARD_SHADOW } from '../profile/MenuSection';
import RouteLine from './RouteLine';
import SwipeAction from './SwipeAction';
import TripStats from './TripStats';
import { distance, duration, rupees } from './format';
import { formatCountdown, useCountdown } from '../../hooks/useCountdown';
import type { PendingBid } from '../../hooks/useQuickRide';
import { colors } from '../../theme/colors';
import type { RideCard } from '../../types/quickRide';

type Props = {
  card: RideCard;
  /** The driver's live bid on this ride, if they have one. */
  bid?: PendingBid;
  onBid: () => void;
  onWithdraw: () => void;
  /** Fired when the card's own `expiresAt` runs out — the card then dies. */
  onExpire: () => void;
  busy?: boolean;
  /**
   * The driver is holding a live bid on a *different* ride. One bid at a time,
   * so every way into the bid sheet is shut on this card until that one is
   * withdrawn or runs out.
   */
  blocked?: boolean;
};

/**
 * One open ride offer — see §2 of `docs/driver-quick-ride.md` for what each
 * number is. The big figure is `offeredFare` (what the rider is offering), not
 * `suggestedFare` (the system's estimate, shown only as a hint).
 */
export default function RideRequestCard({
  card,
  bid,
  onBid,
  onWithdraw,
  onExpire,
  busy = false,
  blocked = false,
}: Props) {
  const { t } = useTranslation();

  const remaining = useCountdown(card.expiresAt, onExpire);
  const bidRemaining = useCountdown(bid?.expiresAt);

  const bounds = card.bidBounds;
  const expired = bid?.status === 'expired';
  const away = distance(card.distanceFromDriverKm);

  // Only worth showing when the rider has actually moved off the estimate.
  const hint =
    typeof card.suggestedFare === 'number' &&
    typeof card.offeredFare === 'number' &&
    Math.abs(card.offeredFare - card.suggestedFare) >= 1
      ? card.offeredFare > card.suggestedFare
        ? t('quickRide.aboveEstimate', { amount: rupees(card.suggestedFare) })
        : t('quickRide.belowEstimate', { amount: rupees(card.suggestedFare) })
      : null;

  return (
    <View
      className={`mb-4 rounded-2xl border border-border bg-white p-4 ${
        expired ? 'opacity-60' : ''
      }`}
      style={CARD_SHADOW}
    >
      {/* The offer, and how long it has left. The distances moved into the
          stat row below, where all three sit together. */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-end">
          <Text className="text-[34px] font-extrabold leading-[38px] text-secondary">
            {rupees(card.offeredFare)}
          </Text>
          <Text className="mb-1.5 ml-2 text-xs font-semibold text-muted">
            {t('quickRide.riderOffers')}
          </Text>
        </View>

        {remaining !== null ? (
          <View className="flex-row items-center">
            <MaterialIcons
              name="schedule"
              size={14}
              color={remaining <= 15 ? colors.danger : colors.muted}
            />
            <Text
              className="ml-1 text-xs font-bold"
              style={{ color: remaining <= 15 ? colors.danger : colors.muted }}
            >
              {formatCountdown(remaining)}
            </Text>
          </View>
        ) : null}
      </View>

      {hint ? (
        <Text className="mt-0.5 text-[11px] font-semibold text-muted">
          {hint}
        </Text>
      ) : null}

      <View className="mt-4">
        <RouteLine
          pickup={card.pickupLocationName}
          drop={card.dropLocationName}
        />
      </View>

      {/* The three numbers that decide whether this ride is worth taking, out
          of the prose and into a row that can be read at a glance. */}
      <View className="mt-4">
        <TripStats
          toPickup={away}
          tripDistance={distance(card.estimatedDistanceKm)}
          tripTime={duration(card.estimatedDurationMin)}
        />
      </View>

      {/* {bounds ? (
        <Text className="mt-3 text-center text-[11px] font-semibold text-muted">
          {t('quickRide.bidRange', {
            min: rupees(bounds.min),
            max: rupees(bounds.max),
          })}
        </Text>
      ) : null} */}

      <View className="mt-4 border-t border-border pt-3">
        {bid ? (
          <BidFooter
            bid={bid}
            remaining={bidRemaining}
            expired={expired}
            onBid={onBid}
            onWithdraw={onWithdraw}
            busy={busy}
            blocked={blocked}
          />
        ) : (
          <SwipeAction
            label={t('quickRide.swipeToBid')}
            onConfirm={onBid}
            disabled={busy || blocked}
            icon="gavel"
          />
        )}

        {/* Say why the swipe is dead — a greyed control with no reason reads
            as a bug to the driver. */}
        {blocked ? (
          <Text className="mt-2 text-center text-[11px] font-semibold text-muted">
            {t('quickRide.bidLocked')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The card once the driver has money on this ride. */
function BidFooter({
  bid,
  remaining,
  expired,
  onBid,
  onWithdraw,
  busy,
  blocked,
}: {
  bid: PendingBid;
  remaining: number | null;
  expired: boolean;
  onBid: () => void;
  onWithdraw: () => void;
  busy: boolean;
  blocked: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-[11px] font-bold uppercase tracking-wide text-muted">
            {t('quickRide.yourBid')}
          </Text>
          <Text className="mt-0.5 text-lg font-extrabold text-secondary">
            {rupees(bid.fare)}
          </Text>
        </View>

        <View
          className="flex-row items-center rounded-full px-3 py-1.5"
          style={{
            backgroundColor: expired
              ? colors.dangerSurface
              : colors.warningSurface,
          }}
        >
          <MaterialIcons
            name={expired ? 'timer-off' : 'hourglass-top'}
            size={13}
            color={expired ? colors.danger : colors.warning}
          />
          <Text
            className="ml-1.5 text-xs font-bold"
            style={{ color: expired ? colors.danger : colors.warning }}
          >
            {expired
              ? t('quickRide.bidExpired')
              : remaining !== null
                ? t('quickRide.bidWaiting', {
                    seconds: formatCountdown(remaining),
                  })
                : t('quickRide.bidPending')}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row">
        <Pressable
          onPress={onBid}
          disabled={busy || blocked}
          className={`flex-1 items-center rounded-xl border border-border py-3 ${
            expired ? '' : 'mr-2'
          } ${busy || blocked ? 'opacity-50' : 'active:bg-surface'}`}
        >
          <Text className="text-sm font-bold text-secondary">
            {/* A bid can only ever be lowered, never walked back up. */}
            {expired ? t('quickRide.bidAgain') : t('quickRide.lowerBid')}
          </Text>
        </Pressable>

        {/* An expired bid is already gone server-side, so there is nothing
            left to withdraw — bidding again is the only move. */}
        {expired ? null : (
          <Pressable
            onPress={onWithdraw}
            disabled={busy}
            className={`flex-1 items-center rounded-xl border py-3 ${
              busy ? 'opacity-50' : 'active:opacity-70'
            }`}
            style={{ borderColor: colors.danger }}
          >
            <Text
              className="text-sm font-bold"
              style={{ color: colors.danger }}
            >
              {t('quickRide.withdraw')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
