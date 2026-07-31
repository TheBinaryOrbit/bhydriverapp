import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import BidSheet from '../../components/quickride/BidSheet';
import DutyPanel, { DutyBlockNote } from '../../components/quickride/DutyPanel';
import RideRequestCard from '../../components/quickride/RideRequestCard';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { useQuickRide } from '../../hooks/useQuickRide';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import type { QuickRide, RideCard } from '../../types/quickRide';
import { notify } from '../../utils/notify';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Props = { token: string | null };

/**
 * The QuickRide home tab — going online, the live ride cards, and bidding.
 * Implements `docs/driver-quick-ride.md` §0–4; §5 onwards lives on the ride
 * details screen this hands off to.
 */
export default function QuickRideTab({ token }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();

  const { location, request, start, stop } = useDriverLocation();

  // A ride is handed over once. Without this the `liveRide` effect would push
  // the details screen again on every re-render that touches it.
  const handedOver = useRef<string | null>(null);

  const openRide = useCallback(
    (rideId: string, ride?: QuickRide | null) => {
      if (handedOver.current === rideId) {
        return;
      }
      handedOver.current = rideId;
      navigation.navigate('RideDetails', { rideId, ride: ride ?? undefined });
    },
    [navigation],
  );

  const quickRide = useQuickRide({
    token,
    location,
    onRideAssigned: openRide,
    requestLocation: request,
    startWatching: start,
    stopWatching: stop,
  });

  const {
    loading,
    refreshing,
    link,
    onDuty,
    switching,
    dutyBlock,
    cards,
    bids,
    liveRide,
    busy,
    dutyLocked,
    needsVehicle,
    refresh,
    goOnline,
    goOffline,
    bid,
    withdraw,
    dropCard,
    clearDutyBlock,
  } = quickRide;

  // Coming back from a completed ride, the next one has to be able to open.
  useEffect(() => {
    if (!liveRide) {
      handedOver.current = null;
    }
  }, [liveRide]);

  // This tab stays mounted behind the ride screens, so nothing re-runs when the
  // driver comes back from one — pull `/live` again on every focus rather than
  // showing a list that stopped being true while they were away. The first
  // focus is skipped: the hook's own initial load is already in flight.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focused.current) {
        focused.current = true;
        return;
      }
      refresh();
    }, [refresh]),
  );

  /* ------------------------------------------------ bidding */

  const [bidRideId, setBidRideId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  // Read from the live list rather than a snapshot, so a fare raise arriving
  // while the sheet is open re-renders the slider against the new bounds.
  const bidCard: RideCard | null =
    cards.find(card => card.rideId === bidRideId) ?? null;

  // The ride was taken or expired under the open sheet.
  useEffect(() => {
    if (bidRideId && !bidCard) {
      setBidRideId(null);
      setBidError(null);
    }
  }, [bidCard, bidRideId]);

  /**
   * One live bid at a time. A bid the driver is still waiting on locks every
   * other card; an expired one does not — that bid is gone server-side, and
   * the driver is free to go somewhere else.
   */
  const lockedByRideId = useMemo(
    () =>
      Object.keys(bids).find(rideId => bids[rideId]?.status === 'pending') ??
      null,
    [bids],
  );

  const openBidSheet = useCallback(
    (rideId: string) => {
      // The cards disable their own buttons; this is the backstop for a tap
      // that lands between a bid landing and the list re-rendering.
      if (lockedByRideId && lockedByRideId !== rideId) {
        notify(t('quickRide.bidLocked'));
        return;
      }
      setBidError(null);
      setBidRideId(rideId);
    },
    [lockedByRideId, t],
  );

  const submitBid = useCallback(
    async (fare: number) => {
      if (!bidRideId) {
        return;
      }
      setSubmitting(true);
      setBidError(null);
      try {
        await bid(bidRideId, fare);
        setBidRideId(null);
        notify(t('quickRide.bidPlaced', { amount: fare }));
      } catch (err) {
        setBidError(
          err instanceof Error ? err.message : t('quickRide.bidFailed'),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [bid, bidRideId, t],
  );

  const confirmWithdraw = useCallback(
    (rideId: string) => {
      Alert.alert(t('quickRide.withdrawTitle'), t('quickRide.withdrawBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('quickRide.withdraw'),
          style: 'destructive',
          onPress: async () => {
            try {
              await withdraw(rideId);
              notify(t('quickRide.withdrawn'));
            } catch (err) {
              notify(
                err instanceof Error
                  ? err.message
                  : t('quickRide.withdrawFailed'),
              );
            }
          },
        },
      ]);
    },
    [t, withdraw],
  );

  /* ------------------------------------------------ duty blocks */

  const handleBlockAction = useCallback(
    (kind: 'kyc' | 'vehicle') => {
      clearDutyBlock();
      navigation.navigate(kind === 'kyc' ? 'Kyc' : 'EditVehicle');
    },
    [clearDutyBlock, navigation],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  const header = (
    <View className="pb-2">
      <DutyPanel
        onDuty={onDuty}
        switching={switching}
        link={link}
        locked={dutyLocked}
        onGoOnline={goOnline}
        onGoOffline={goOffline}
      />

      {dutyBlock ? (
        <DutyBlockNote
          block={dutyBlock}
          onAction={handleBlockAction}
          onRetry={goOnline}
        />
      ) : null}

      {/* `/live` told us there is no vehicle — the same gate `driver:online`
          enforces, surfaced before the driver hits it. */}
      {!dutyBlock && needsVehicle ? (
        <DutyBlockNote
          block={{ kind: 'vehicle' }}
          onAction={handleBlockAction}
          onRetry={goOnline}
        />
      ) : null}

      {busy && liveRide ? (
        <Pressable
          onPress={() =>
            navigation.navigate('RideDetails', { rideId: liveRide.rideId })
          }
          className="mt-4 flex-row items-center rounded-2xl border border-border bg-white p-4 active:bg-surface"
          style={CARD_SHADOW}
        >
          <View
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.successSurface }}
          >
            <MaterialIcons name="local-taxi" size={22} color={colors.success} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-[15px] font-bold text-secondary">
              {t('quickRide.onRideTitle')}
            </Text>
            <Text className="mt-0.5 text-xs text-muted">
              {liveRide.phase === 'drop'
                ? t('quickRide.onRideToDrop')
                : t('quickRide.onRideToPickup')}
            </Text>
          </View>
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={colors.indicatorBorder}
          />
        </Pressable>
      ) : null}

      {cards.length > 0 ? (
        <Text className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-muted">
          {t('quickRide.nearbyCount', { count: cards.length })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={busy ? [] : cards}
        keyExtractor={card => card.rideId}
        ListHeaderComponent={header}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.secondary}
          />
        }
        renderItem={({ item }) => (
          <RideRequestCard
            card={item}
            bid={bids[item.rideId]}
            busy={submitting}
            blocked={!!lockedByRideId && lockedByRideId !== item.rideId}
            onBid={() => openBidSheet(item.rideId)}
            onWithdraw={() => confirmWithdraw(item.rideId)}
            onExpire={() => dropCard(item.rideId)}
          />
        )}
        ListEmptyComponent={
          busy ? null : <EmptyState onDuty={onDuty} link={link} />
        }
      />

      <BidSheet
        card={bidCard}
        bid={bidRideId ? bids[bidRideId] : undefined}
        submitting={submitting}
        error={bidError}
        onSubmit={submitBid}
        onClose={() => setBidRideId(null)}
      />
    </View>
  );
}

/** Offline, or online with nothing in range yet — two different messages. */
function EmptyState({ onDuty, link }: { onDuty: boolean; link: string }) {
  const { t } = useTranslation();
  const waiting = onDuty && link !== 'disconnected';

  return (
    <View className="flex-1 items-center justify-center px-6 py-16">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surface }}
      >
        {waiting ? (
          <ActivityIndicator color={colors.tertiary} />
        ) : (
          <MaterialIcons
            name="power-settings-new"
            size={34}
            color={colors.indicatorBorder}
          />
        )}
      </View>

      <Text className="mt-5 text-base font-bold text-secondary">
        {waiting ? t('quickRide.waitingTitle') : t('quickRide.emptyTitle')}
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        {waiting ? t('quickRide.waitingBody') : t('quickRide.emptyBody')}
      </Text>
    </View>
  );
}
