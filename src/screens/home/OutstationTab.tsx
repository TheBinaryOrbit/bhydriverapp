import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import BusyNote from '../../components/outstation/BusyNote';
import OutstationRequestCard from '../../components/outstation/OutstationRequestCard';
import { departureLabel, leadTime } from '../../components/outstation/format';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import BidSheet from '../../components/quickride/BidSheet';
import DutyPanel, {
  DutyBlockNote,
} from '../../components/quickride/DutyPanel';
import {
  lastKnownFix,
  useDriverLocation,
} from '../../hooks/useDriverLocation';
import { useDuty } from '../../hooks/useDuty';
import {
  useOutstation,
  type DepartureFilter,
} from '../../hooks/useOutstation';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import type { OutstationCard, OutstationRide } from '../../types/outstation';
import type { LatLng } from '../../types/quickRide';
import { notify } from '../../utils/notify';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Props = { token: string | null };

const FILTERS: DepartureFilter[] = ['all', 'now', 'later'];

/**
 * Outstation — the long-distance half of the home screen.
 *
 * Reads as a **browse** screen rather than a dispatch queue, because that is
 * what it is: most of these trips were booked while this driver was asleep and
 * will never be pushed to them. So the list is filterable by departure, and an
 * offline driver still sees everything — they are told only that new trips
 * won't be pushed, which is the sole thing being offline costs them here.
 *
 * The duty switch is the *same* switch as QuickRide's, not a second one: duty
 * lives on `driverSocket` and every change is broadcast, so `useDuty` here and
 * `useDuty` there read one state and move it together. A driver who opens this
 * tab offline should not have to go and find another screen to fix that.
 */
export default function OutstationTab({ token }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();

  /**
   * The 20 km radius on `/available` needs a fix, but this tab never prompts
   * for one on mount and never starts a watch just to browse.
   *
   * QuickRide's watcher is the app's usual continuous fix, so whatever it last
   * published is reused. Asking for one here would put a location prompt in
   * front of every driver at launch, including those who never touch this tab —
   * and without a fix the endpoint still returns the live trip and the standing
   * bids, only the browse list comes back empty. That case says so, with a
   * button that asks.
   *
   * The watcher is handed to the hook all the same: a trip in `arriving` has a
   * rider watching the map, and that is not optional.
   */
  const {
    location: ownFix,
    request,
    start: startWatching,
    stop: stopWatching,
  } = useDriverLocation();
  const [sharedFix, setSharedFix] = useState<LatLng | null>(() =>
    lastKnownFix(),
  );

  useFocusEffect(
    useCallback(() => {
      setSharedFix(previous => lastKnownFix() ?? previous);
    }, []),
  );

  const location = ownFix ?? sharedFix;

  // A trip is handed over once. Without this the `liveRide` effect would push
  // the trip screen again on every re-render that touches it.
  const handedOver = useRef<string | null>(null);

  const openRide = useCallback(
    (rideId: string, ride?: OutstationRide | null) => {
      if (handedOver.current === rideId) {
        return;
      }
      handedOver.current = rideId;
      navigation.navigate('OutstationDetails', {
        rideId,
        ride: ride ?? undefined,
      });
    },
    [navigation],
  );

  const {
    loading,
    refreshing,
    cards,
    bids,
    liveRide,
    busy,
    busyReason,
    busyMessage,
    needsVehicle,
    needsLocation,
    departure,
    error,
    refresh,
    setDeparture,
    bid,
    withdraw,
    dropCard,
  } = useOutstation({
    token,
    location,
    onRideAssigned: openRide,
    requestLocation: request,
    startWatching,
    stopWatching,
  });

  const {
    link,
    onDuty,
    switching,
    dutyBlock,
    dutyLocked,
    goOnline,
    goOffline,
    clearDutyBlock,
  } = useDuty({
    requestLocation: request,
    startWatching,
    // Going online is the one moment this tab is *sure* it has a fresh fix, and
    // the browse list is built from one — so this doubles as the retry for a
    // list that came back empty for want of coordinates.
    onWentOnline: refresh,
  });

  // Coming back from a finished trip, the next one has to be able to open.
  useEffect(() => {
    if (!liveRide) {
      handedOver.current = null;
    }
  }, [liveRide]);

  // This tab stays mounted behind the trip screens, so nothing re-runs when the
  // driver comes back from one. The first focus is skipped — the hook's own
  // initial load is already in flight.
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
  const bidCard: OutstationCard | null =
    cards.find(card => card.rideId === bidRideId) ?? null;

  // The trip was taken or expired under the open sheet.
  useEffect(() => {
    if (bidRideId && !bidCard) {
      setBidRideId(null);
      setBidError(null);
    }
  }, [bidCard, bidRideId]);

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
      Alert.alert(
        t('quickRide.withdrawTitle'),
        t('outstation.withdrawBody'),
        [
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
        ],
      );
    },
    [t, withdraw],
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
          onAction={kind => {
            clearDutyBlock();
            navigation.navigate(kind === 'kyc' ? 'Kyc' : 'EditVehicle');
          }}
          onRetry={goOnline}
        />
      ) : null}

      {/* The trip the driver has already committed to. `assigned` deliberately
          does not take over the screen — it can be thirty days out — so this
          banner is the way back into it. */}
      {liveRide ? (
        <CommittedTrip
          ride={liveRide.ride}
          onPress={() =>
            navigation.navigate('OutstationDetails', {
              rideId: liveRide.rideId,
              ride: liveRide.ride ?? undefined,
            })
          }
        />
      ) : null}

      {busy && !liveRide ? <BusyNote reason={busyReason} message={busyMessage} /> : null}

      {needsVehicle ? (
        <DutyBlockNote
          block={{ kind: 'vehicle' }}
          onAction={() => navigation.navigate('EditVehicle')}
          onRetry={refresh}
        />
      ) : null}

      {/* Going on duty means `driver:online` was acked, which it cannot be
          without a position — so a driver who is online has a location, whatever
          the last `/live` was built without. Saying otherwise above a switch
          that says "You're online" reads as a broken app. */}
      {needsLocation && !onDuty && !dutyBlock ? (
        <DutyBlockNote
          block={{ kind: 'location' }}
          onAction={() => {}}
          onRetry={() => {
            request().then(() => refresh());
          }}
        />
      ) : null}

      {/* Being offline costs the driver *pushed* trips only — the list below is
          the same either way, so this is a note and not a blocker. */}
      {!onDuty && !busy ? (
        <View
          className="mt-4 flex-row items-start rounded-2xl border p-3.5"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <MaterialIcons
            name="notifications-off"
            size={16}
            color={colors.muted}
            style={{ marginTop: 1 }}
          />
          <Text className="ml-2.5 flex-1 text-xs leading-5 text-muted">
            {t('outstation.offlineNote')}
          </Text>
        </View>
      ) : null}

      <View className="mt-4 flex-row">
        {FILTERS.map(key => {
          const on = departure === key;
          return (
            <Pressable
              key={key}
              onPress={() => setDeparture(key)}
              className={`mr-2 rounded-full border px-4 py-2 active:opacity-70 ${
                on ? 'bg-tertiary/10' : ''
              }`}
              style={{ borderColor: on ? colors.tertiary : colors.border }}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: on ? colors.tertiary : colors.muted }}
              >
                {t(`outstation.filter.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {cards.length > 0 ? (
        <Text className="mb-3 mt-5 text-xs font-bold uppercase tracking-wide text-muted">
          {t('outstation.tripCount', { count: cards.length })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={cards}
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
          <OutstationRequestCard
            card={item}
            bid={bids[item.rideId]}
            busy={submitting}
            blocked={busy}
            onBid={() => {
              setBidError(null);
              setBidRideId(item.rideId);
            }}
            onWithdraw={() => confirmWithdraw(item.rideId)}
            onExpire={() => dropCard(item.rideId)}
          />
        )}
        ListEmptyComponent={
          error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState busy={busy} filtered={departure !== 'all'} />
          )
        }
      />

      <BidSheet
        card={bidCard}
        bid={bidRideId ? bids[bidRideId] : undefined}
        submitting={submitting}
        error={bidError}
        note={t('outstation.bidNote')}
        onSubmit={submitBid}
        onClose={() => setBidRideId(null)}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/**
 * The accepted trip, waiting. Shows the departure rather than a status word:
 * "Friday, 6:00 am" is the thing the driver has to plan around, and the two
 * hours before it are when they stop taking QuickRides.
 */
function CommittedTrip({
  ride,
  onPress,
}: {
  ride: OutstationRide | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  const underway =
    ride?.rideStatus === 'arriving' || ride?.rideStatus === 'in_progress';
  const departs = departureLabel(ride?.pickupAt, t);
  const lead = leadTime(ride?.pickupAt, t);

  return (
    <Pressable
      onPress={onPress}
      className="mt-2 flex-row items-center rounded-2xl border border-border bg-white p-4 active:bg-surface"
      style={CARD_SHADOW}
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{
          backgroundColor: underway
            ? colors.successSurface
            : colors.warningSurface,
        }}
      >
        <MaterialIcons
          name={underway ? 'local-taxi' : 'event-available'}
          size={22}
          color={underway ? colors.success : colors.warning}
        />
      </View>

      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-bold text-secondary">
          {underway
            ? t('outstation.tripUnderway')
            : t('outstation.tripBooked')}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {departs
            ? `${departs}${lead ? ` · ${lead}` : ''}`
            : (ride?.dropLocationName ?? t('outstation.tripBookedBody'))}
        </Text>
      </View>

      <MaterialIcons
        name="chevron-right"
        size={22}
        color={colors.indicatorBorder}
      />
    </Pressable>
  );
}

/** Nothing on offer — for one of three quite different reasons. */
function EmptyState({ busy, filtered }: { busy: boolean; filtered: boolean }) {
  const { t } = useTranslation();

  const key = busy ? 'busy' : filtered ? 'filtered' : 'none';
  const icon = busy ? 'block' : filtered ? 'filter-list-off' : 'explore';

  return (
    <View className="flex-1 items-center justify-center px-6 py-16">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surface }}
      >
        <MaterialIcons name={icon} size={34} color={colors.indicatorBorder} />
      </View>

      <Text className="mt-5 text-base font-bold text-secondary">
        {t(`outstation.empty.${key}Title`)}
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        {t(`outstation.empty.${key}Body`)}
      </Text>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center px-6 py-16">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.dangerSurface }}
      >
        <MaterialIcons name="cloud-off" size={34} color={colors.danger} />
      </View>

      <Text className="mt-5 text-base font-bold text-secondary">
        {t('outstation.errorTitle')}
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        {message}
      </Text>

      <Pressable
        onPress={onRetry}
        className="mt-5 rounded-xl border border-border px-5 py-3 active:bg-surface"
      >
        <Text className="text-sm font-bold text-secondary">
          {t('quickRide.retry')}
        </Text>
      </Pressable>
    </View>
  );
}
