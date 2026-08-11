import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import {
  EXPIRY_COUNTDOWN_THRESHOLD_S,
  departureLabel,
  distance,
  duration,
  leadTime,
  rupees,
  summaryLine,
} from './format';
import { CARD_SHADOW } from '../profile/MenuSection';
import BidControl from '../quickride/BidControl';
import RouteLine from '../quickride/RouteLine';
import TripStats from '../quickride/TripStats';
import { formatCountdown, useCountdown } from '../../hooks/useCountdown';
import type { OutstationPendingBid } from '../../hooks/useOutstation';
import { colors } from '../../theme/colors';
import type { OutstationCard } from '../../types/outstation';

type Props = {
  card: OutstationCard;
  /** The driver's standing bid on this trip, if they have one. */
  bid?: OutstationPendingBid;
  /** The fare the driver swiped on. */
  onBid: (fare: number) => void;
  onWithdraw: () => void;
  /** Fired when the offer window runs out — the card then dies. */
  onExpire: () => void;
  /** Another card's bid is in flight — nothing here may be swiped meanwhile. */
  busy?: boolean;
  /** This card's own bid is in flight. */
  submitting?: boolean;
  /** Why the last bid on *this* trip was rejected. */
  error?: string | null;
  /**
   * The driver can't take outstation work at all right now. Unlike QuickRide
   * this is never "you already bid elsewhere" — standing bids don't block each
   * other — so it's a whole-tab state, passed down only to grey the button.
   */
  blocked?: boolean;
};

/**
 * One open outstation offer.
 *
 * The headline is the **departure**, not a countdown: an outstation card can
 * sit on screen for a day and describe a trip three weeks out, so "when does
 * this leave, and how long have I got to decide" are two different questions
 * and both are answered. The offer's own expiry (`createdAt + 24h`) only
 * becomes a ticking chip in its final hour, where it changes what the driver
 * does; before that it is noise.
 *
 * The bid is placed on the card: slider, range and swipe, no sheet in between.
 */
export default function OutstationRequestCard({
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

  /**
   * The driver asked to change a bid they already hold, so the slider is back.
   * Collapsed by default — a standing bid can sit for days, and a card that
   * keeps its slider open is a card that's mostly slider.
   */
  const [editing, setEditing] = useState(false);

  // A bid that lands replaces the one being edited — put the slider away
  // rather than leave it open against stale bounds.
  useEffect(() => {
    setEditing(false);
  }, [bid?.fare]);

  // Still armed at any remaining time — the card must die when the offer does,
  // even though the number is only *shown* in the last hour.
  const remaining = useCountdown(card.expiresAt, onExpire);

  const departs = departureLabel(card.pickupAt, t);
  const lead = leadTime(card.pickupAt, t);
  const away = distance(card.distanceFromDriverKm);
  const scheduled = card.bookingType === 'later';

  // Only worth showing when the rider has actually moved off the estimate.
  const hint =
    typeof card.suggestedFare === 'number' &&
    typeof card.offeredFare === 'number' &&
    Math.abs(card.offeredFare - card.suggestedFare) >= 1
      ? card.offeredFare > card.suggestedFare
        ? t('quickRide.aboveEstimate', { amount: rupees(card.suggestedFare) })
        : t('quickRide.belowEstimate', { amount: rupees(card.suggestedFare) })
      : null;

  const closing =
    remaining !== null && remaining <= EXPIRY_COUNTDOWN_THRESHOLD_S;

  return (
    <View
      className="mb-3 rounded-2xl border border-border bg-white p-3.5"
      style={CARD_SHADOW}
    >
      {/* Departure first — it is what makes this an outstation trip rather
          than a long QuickRide. */}
      <View className="flex-row items-start justify-between">
        <View className="flex-1 flex-row items-center">
          <MaterialIcons
            name={scheduled ? 'event' : 'bolt'}
            size={14}
            color={colors.tertiary}
          />
          <Text
            className="ml-1.5 flex-1 text-[12px] font-extrabold text-secondary"
            numberOfLines={1}
          >
            {departs ?? t('outstation.departUnknown')}
          </Text>
        </View>

        {closing ? (
          <View className="ml-2 flex-row items-center">
            <MaterialIcons name="timer" size={12} color={colors.danger} />
            <Text
              className="ml-1 text-[11px] font-bold"
              style={{ color: colors.danger }}
            >
              {formatCountdown(remaining!)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* The distance to the pickup moved into the stat row below, with the
          other two numbers. */}
      {lead ? (
        <View className="mt-1 flex-row">
          <View className="rounded-full bg-surface px-2 py-0.5">
            <Text className="text-[10px] font-bold text-muted">{lead}</Text>
          </View>
        </View>
      ) : null}

      {/* The offer. */}
      <View className="mt-2.5 flex-row items-end">
        <Text className="text-[27px] font-extrabold leading-[30px] text-secondary">
          {rupees(card.offeredFare)}
        </Text>
        <Text className="mb-1 ml-1.5 text-[11px] font-semibold text-muted">
          {t('quickRide.riderOffers')}
        </Text>
      </View>
      {hint ? (
        <Text className="mt-0.5 text-[10px] font-semibold text-muted">
          {hint}
        </Text>
      ) : null}

      <View className="mt-3">
        <RouteLine
          compact
          pickup={card.pickupLocationName}
          drop={card.dropLocationName}
        />
      </View>

      {/* The three numbers that decide whether this trip is worth taking, out
          of the prose and into a row that can be read at a glance. */}
      <View className="mt-3">
        <TripStats
          toPickup={away}
          tripDistance={distance(card.estimatedDistanceKm)}
          tripTime={duration(card.estimatedDurationMin)}
        />
      </View>

      {/* What's left of the old summary line: the vehicle class this trip
          wants, and the window a bid has to land inside. */}
      <Text className="mt-2.5 text-center text-[10px] font-semibold text-muted">
        {summaryLine([
          card.vehicleTypeName,
          card.bidBounds
            ? t('quickRide.bidRange', {
                min: rupees(card.bidBounds.min),
                max: rupees(card.bidBounds.max),
              })
            : null,
        ])}
      </Text>

      <View className="mt-3 border-t border-border pt-2.5">
        {bid ? (
          <>
            <BidSummary
              bid={bid}
              onWithdraw={onWithdraw}
              onEdit={() => setEditing(true)}
              onCancelEdit={() => setEditing(false)}
              editing={editing}
              busy={busy || submitting}
              blocked={blocked}
            />

            {editing ? (
              <View className="mt-3">
                <BidControl
                  rideId={card.rideId}
                  bounds={card.bidBounds}
                  offeredFare={card.offeredFare}
                  currentBid={bid.fare}
                  submitting={submitting}
                  error={error}
                  disabled={busy || blocked}
                  note={t('outstation.bidNote')}
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
            note={t('outstation.bidNote')}
            onSubmit={onBid}
          />
        )}
      </View>
    </View>
  );
}

/**
 * The card once the driver has money on this trip.
 *
 * No countdown and no expired state: an outstation bid stays on the rider's
 * screen until something explicitly removes it, so "waiting" here means waiting
 * indefinitely — possibly for days, on a trip booked weeks out. Saying so is
 * what stops the driver assuming it quietly lapsed.
 */
function BidSummary({
  bid,
  onWithdraw,
  onEdit,
  onCancelEdit,
  editing,
  busy,
  blocked,
}: {
  bid: OutstationPendingBid;
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
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
            {t('quickRide.yourBid')}
          </Text>
          <Text className="text-base font-extrabold text-secondary">
            {rupees(bid.fare)}
          </Text>
        </View>

        <View
          className="flex-row items-center rounded-full px-2.5 py-1"
          style={{ backgroundColor: colors.warningSurface }}
        >
          <MaterialIcons
            name="hourglass-top"
            size={12}
            color={colors.warning}
          />
          <Text
            className="ml-1.5 text-[11px] font-bold"
            style={{ color: colors.warning }}
          >
            {t('outstation.bidStanding')}
          </Text>
        </View>
      </View>

      <View className="mt-2.5 flex-row">
        <Pressable
          onPress={editing ? onCancelEdit : onEdit}
          disabled={busy || blocked}
          className={`mr-2 flex-1 items-center rounded-xl border border-border py-2.5 ${
            busy || blocked ? 'opacity-50' : 'active:bg-surface'
          }`}
        >
          <Text className="text-[13px] font-bold text-secondary">
            {/* A bid can only ever be lowered, never walked back up. */}
            {editing ? t('common.cancel') : t('quickRide.lowerBid')}
          </Text>
        </Pressable>

        <Pressable
          onPress={onWithdraw}
          disabled={busy}
          className={`flex-1 items-center rounded-xl border py-2.5 ${
            busy ? 'opacity-50' : 'active:opacity-70'
          }`}
          style={{ borderColor: colors.danger }}
        >
          <Text
            className="text-[13px] font-bold"
            style={{ color: colors.danger }}
          >
            {t('quickRide.withdraw')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
