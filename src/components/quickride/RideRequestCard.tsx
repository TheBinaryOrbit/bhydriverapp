import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { CARD_SHADOW } from '../profile/MenuSection';
import BidControl from './BidControl';
import RouteLine from './RouteLine';
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
  /** The fare the driver swiped on. */
  onBid: (fare: number) => void;
  onWithdraw: () => void;
  /** Fired when the card's own `expiresAt` runs out — the card then dies. */
  onExpire: () => void;
  /** Another card's bid is in flight — nothing here may be swiped meanwhile. */
  busy?: boolean;
  /** This card's own bid is in flight. */
  submitting?: boolean;
  /** Why the last bid on *this* ride was rejected. */
  error?: string | null;
  /**
   * The driver is holding a live bid on a *different* ride. One bid at a time,
   * so bidding is shut on this card until that one is withdrawn or runs out.
   */
  blocked?: boolean;
};

/**
 * One open ride offer — see §2 of `docs/driver-quick-ride.md` for what each
 * number is. The big figure is `offeredFare` (what the rider is offering), not
 * `suggestedFare` (the system's estimate, shown only as a hint).
 *
 * The bid is placed on the card: slider, range and swipe, no sheet in between.
 */
export default function RideRequestCard({
  card,
  bid,
  onBid,
  onWithdraw,
  onExpire,
  busy = false,
  submitting = false,
  error,
  blocked = false,
}: Props) {
  const { t } = useTranslation();

  const remaining = useCountdown(card.expiresAt, onExpire);
  const bidRemaining = useCountdown(bid?.expiresAt);

  const expired = bid?.status === 'expired';
  const away = distance(card.distanceFromDriverKm);

  /**
   * The driver asked to change a bid they already hold, so the slider is back.
   * Collapsed by default — a placed bid is usually left alone, and a card that
   * keeps its slider open is a card that's mostly slider.
   */
  const [editing, setEditing] = useState(false);

  // A bid that lands (or lapses) replaces the one being edited — put the
  // slider away rather than leave it open against stale bounds.
  useEffect(() => {
    setEditing(false);
  }, [bid?.fare, bid?.status]);

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

      <View className="mt-4 border-t border-border pt-3">
        {bid ? (
          <>
            <BidSummary
              bid={bid}
              remaining={bidRemaining}
              expired={expired}
              onWithdraw={onWithdraw}
              onEdit={() => setEditing(true)}
              onCancelEdit={() => setEditing(false)}
              editing={editing}
              busy={busy || submitting}
              blocked={blocked}
            />

            {editing ? (
              <View className="mt-4">
                <BidControl
                  rideId={card.rideId}
                  bounds={card.bidBounds}
                  offeredFare={card.offeredFare}
                  // An expired bid is gone server-side, so the next one is a
                  // fresh bid against the full range, not an undercut.
                  currentBid={expired ? undefined : bid.fare}
                  submitting={submitting}
                  error={error}
                  disabled={busy || blocked}
                  note={t('quickRide.bidNote')}
                  onSubmit={onBid}
                />
              </View>
            ) : null}
          </>
        ) : (
          <BidControl
            rideId={card.rideId}
            bounds={card.bidBounds}
            offeredFare={card.offeredFare}
            submitting={submitting}
            error={error}
            disabled={busy || blocked}
            note={t('quickRide.bidNote')}
            onSubmit={onBid}
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
function BidSummary({
  bid,
  remaining,
  expired,
  onWithdraw,
  onEdit,
  onCancelEdit,
  editing,
  busy,
  blocked,
}: {
  bid: PendingBid;
  remaining: number | null;
  expired: boolean;
  onWithdraw: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  editing: boolean;
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
          onPress={editing ? onCancelEdit : onEdit}
          disabled={busy || blocked}
          className={`flex-1 items-center rounded-xl border border-border py-3 ${
            expired ? '' : 'mr-2'
          } ${busy || blocked ? 'opacity-50' : 'active:bg-surface'}`}
        >
          <Text className="text-sm font-bold text-secondary">
            {/* A bid can only ever be lowered, never walked back up. */}
            {editing
              ? t('common.cancel')
              : expired
                ? t('quickRide.bidAgain')
                : t('quickRide.lowerBid')}
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
