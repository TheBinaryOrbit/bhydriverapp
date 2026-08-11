import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import KeyboardSafeView from '../../components/KeyboardSafeView';
import RoutePreviewMap from '../../components/quickride/RoutePreviewMap';
import SwipeAction from '../../components/quickride/SwipeAction';
import ScreenHeader from '../../components/ScreenHeader';
import {
  departureLabel,
  distance,
  duration,
  leadTime,
  rupees,
  summaryLine,
} from '../../components/outstation/format';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import OtpBoxes from '../../components/quickride/OtpBoxes';
import RouteLine from '../../components/quickride/RouteLine';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import type { RootStackParamList } from '../../navigation/types';
import { ApiError } from '../../services/api';
import { driverSocket } from '../../services/driverSocket';
import {
  completeOutstationRide,
  fetchOutstationRide,
  pickupOutstationRide,
  startOutstationRide,
  type OutstationOtpError,
} from '../../services/outstationService';
import { getToken } from '../../storage/authStorage';
import { colors } from '../../theme/colors';
import {
  isTracking,
  outstationPhase,
  type OutstationRide,
  type OutstationRideStatus,
} from '../../types/outstation';
import { toLatLng } from '../../types/quickRide';
import { callNumber, openExternalNavigation } from '../../utils/maps';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'OutstationDetails'>;

/** 5 wrong tries and the trip is locked; only cancelling gets out of it. */
const OTP_LENGTH = 4;

/**
 * Shorter than the map's own default, because everything under it has to fit
 * on the same screen. Still enough to see which way the leg runs, which is all
 * this map is for — the turn-by-turn is a button away.
 */
const MAP_HEIGHT = 150;

/**
 * This screen's own claim on duty, distinct from `useOutstation`'s.
 *
 * Two keys, not one: the hook holds duty for as long as the trip is `arriving`,
 * but it only learns the status changed when `/live` next runs. This screen
 * covers the gap that opens the instant `/start` returns — and its cleanup
 * must not drop the hook's hold on the way out.
 */
const DUTY_HOLD = 'outstation-screen';

/**
 * The committed outstation trip — see `docs/driver-outstation-ride.md` §The
 * shape of the whole thing.
 *
 * Three statuses, and the difference between them is the whole screen:
 *
 * - **`assigned`** — committed, possibly days ahead. No tracking, no
 *   navigation, no OTP. The rider cannot see this driver and there is no share
 *   link. The only action is `/start`.
 * - **`arriving`** — tracking is LIVE. The 5s `driver:location` ping feeds the
 *   rider's map and the link they may have sent to family, so this screen pins
 *   duty on for as long as it is in this state. Navigate to pickup, then OTP.
 * - **`in_progress`** — tracking is **still live**. The room is not torn down at
 *   pickup; `outstation:picked_up` only relabels the rider's map to "on board",
 *   and the stream runs unbroken until `/complete`. Navigate to drop, then
 *   complete.
 *
 * The two driver actions are the other split from QuickRide: `/start` says "I
 * am setting off", `/pickup` says "the rider is aboard". QuickRide collapses
 * both into one OTP step.
 */
export default function OutstationDetailsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const { rideId } = route.params;

  // The socket's `outstation:bid_accepted` carries a trip complete enough to
  // paint with, so the screen is never blank while `GET /:id` is in flight.
  const [ride, setRide] = useState<OutstationRide | null>(
    route.params.ride ?? null,
  );
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(!route.params.ride);
  const [error, setError] = useState<string | null>(null);

  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [completing, setCompleting] = useState(false);
  /** `driver:online` failed, so nothing is reaching the rider's map. */
  const [trackingFailed, setTrackingFailed] = useState(false);

  const status: OutstationRideStatus = ride?.rideStatus ?? 'assigned';
  const phase = outstationPhase(status);
  const tracking = isTracking(status);

  /* ------------------------------------------------ loading */

  const load = useCallback(async () => {
    const stored = await getToken();
    setToken(stored);
    if (!stored) {
      return;
    }
    try {
      // The socket payload is a first paint; this is the source of truth.
      setRide(await fetchOutstationRide(stored, rideId));
      setError(null);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        // Stale screen — the trip isn't ours, or is gone.
        notify(err.message);
        navigation.goBack();
        return;
      }
      setError(err instanceof Error ? err.message : t('outstationRide.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [navigation, rideId, t]);

  useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------------------------ tracking */

  const {
    location: driverAt,
    request: requestLocation,
    start: startWatching,
    stop: stopWatching,
  } = useDriverLocation();

  /**
   * `arriving` and `in_progress` are the statuses a rider can watch, and the
   * only thing feeding them is the on-duty location ping. A driver who set off
   * from a cold start — or who was offline when they tapped Start — would
   * otherwise leave the rider staring at a car that never moves, with no error
   * anywhere to explain it.
   *
   * So while either status holds: pin duty (so a tap on the QuickRide tab's Go
   * offline can't kill it), run the watcher, and announce if not already on.
   *
   * `useOutstation` runs the same three, and the overlap is deliberate. It only
   * learns the status changed when `/live` next runs — which, on the ordinary
   * path, is when this screen is popped — so for the whole drive to the pickup
   * this is the only watcher feeding the rider's map. Both publish into the
   * same `driverSocket.setPosition`, so running both costs a second GPS
   * subscription and nothing else.
   */
  useEffect(() => {
    if (!tracking) {
      return;
    }
    driverSocket.holdDuty(DUTY_HOLD);
    startWatching();

    let cancelled = false;
    (async () => {
      if (driverSocket.isOnDuty) {
        setTrackingFailed(false);
        return;
      }
      const fix = await requestLocation();
      if (cancelled) {
        return;
      }
      const ack = await driverSocket.goOnline(
        fix ? { latitude: fix.lat, longitude: fix.lng } : null,
      );
      if (!cancelled) {
        setTrackingFailed(!ack.ok);
      }
    })();

    return () => {
      cancelled = true;
      // Only the *hold* goes, and only for this screen — `useOutstation` keeps
      // its own for as long as the trip is live, so backing out of here hands
      // the ping over rather than ending it. Duty itself becomes switchable
      // again at `/complete`, when the last hold is released.
      driverSocket.releaseDuty(DUTY_HOLD);
      stopWatching();
    };
  }, [requestLocation, startWatching, stopWatching, tracking]);

  /* ------------------------------------------------ live updates */

  const goneRef = useRef(false);

  // The socket handlers are registered once and would otherwise close over the
  // trip as it was on first render.
  const rideRef = useRef<OutstationRide | null>(ride);
  rideRef.current = ride;

  /** Patches the local trip without a round trip — used by the socket events. */
  const patch = useCallback((changes: Partial<OutstationRide>) => {
    setRide(previous => (previous ? { ...previous, ...changes } : previous));
  }, []);

  useEffect(() => {
    const mine = (id?: string) => id === rideId;

    const off = [
      driverSocket.on('outstation:picked_up', payload => {
        if (mine(payload.rideId)) {
          patch({
            rideStatus: 'in_progress',
            pickedUpAt: payload.pickedUpAt,
          });
        }
      }),

      driverSocket.on('outstation:completed', payload => {
        if (!mine(payload.rideId) || goneRef.current) {
          return;
        }
        goneRef.current = true;
        navigation.replace('RideSuccess', {
          rideId,
          finalFare: payload.finalFare ?? rideRef.current?.finalFare,
          completedAt: payload.completedAt,
          dropLocationName: rideRef.current?.dropLocationName,
        });
      }),

      driverSocket.on('outstation:ride_cancelled', payload => {
        if (!mine(payload.rideId) || goneRef.current) {
          return;
        }
        goneRef.current = true;
        notify(
          payload.cancellationReason ?? t('outstationRide.cancelledByRider'),
        );
        navigation.goBack();
      }),
    ];

    return () => off.forEach(unsubscribe => unsubscribe());
  }, [navigation, patch, rideId, t]);

  /* ------------------------------------------------ actions */

  const target = useMemo(
    () =>
      toLatLng(
        phase === 'drop' ? ride?.dropCoordinates : ride?.pickupCoordinates,
      ),
    [phase, ride?.dropCoordinates, ride?.pickupCoordinates],
  );

  /**
   * The two legs offer different navigators, on purpose.
   *
   * **To the pickup** stays in-app, and is not a choice: the leg ends in the OTP
   * step, and a driver sent out to Google Maps arrives with no obvious way back
   * to the screen that takes the code.
   *
   * **To the drop** offers both, because neither one is right for every driver.
   * Google Maps is what most of them already use, with live traffic, lane
   * guidance and offline maps for the stretches of a several-hundred-kilometre
   * run that have no signal — and there is no step to come back for until
   * "Complete trip" at the far end. But leaving the app is not free either: the
   * driver loses the fare, the rider's number and the Complete swipe behind
   * another app, so in-app guidance stays on offer for the ones who'd rather
   * keep them.
   *
   * Neither choice touches the location ping. It runs off duty in the
   * background service, not off this screen or the SDK, so the rider's map
   * keeps moving with the app buried behind Google Maps — which is the whole
   * reason handing the drop leg away is safe.
   */
  const handleNavigate = useCallback(
    async (leg: 'pickup' | 'drop', via: 'app' | 'maps' = 'app') => {
      const destination = toLatLng(
        leg === 'pickup' ? ride?.pickupCoordinates : ride?.dropCoordinates,
      );
      if (!destination) {
        notify(t('ride.noCoordinates'));
        return;
      }
      const label =
        leg === 'pickup' ? ride?.pickupLocationName : ride?.dropLocationName;

      if (via === 'maps') {
        if (!(await openExternalNavigation(destination, label))) {
          notify(t('outstationRide.mapsFailed'));
        }
        return;
      }

      navigation.navigate('Navigate', {
        destination,
        title: label ?? t('ride.destination'),
      });
    },
    [
      navigation,
      ride?.dropCoordinates,
      ride?.dropLocationName,
      ride?.pickupCoordinates,
      ride?.pickupLocationName,
      t,
    ],
  );

  const handleCall = useCallback(async () => {
    if (!(await callNumber(ride?.bookedBy?.phoneNumber))) {
      notify(t('ride.callFailed'));
    }
  }, [ride?.bookedBy?.phoneNumber, t]);

  /**
   * `/start` — no OTP and no body.
   *
   * No confirmation dialog: the swipe **is** the confirmation. It used to be
   * guarded because a stray tap on a trip booked days ahead would silently
   * start broadcasting the driver's position, and that is exactly the accident
   * a 75%-of-the-track drag cannot have.
   */
  const handleStart = useCallback(async () => {
    if (!token || starting) {
      return;
    }
    setStarting(true);
    try {
      const { ride: started } = await startOutstationRide(token, rideId);
      setRide(started);
    } catch (err) {
      // 409 = not `assigned` any more. Already started elsewhere, or cancelled
      // underneath us — refetching settles which.
      if (err instanceof ApiError && err.status === 409) {
        load();
      }
      notify(
        err instanceof Error ? err.message : t('outstationRide.startFailed'),
      );
    } finally {
      setStarting(false);
    }
  }, [load, rideId, starting, t, token]);

  /** `/pickup` — the rider reads out a 4-digit code and boards. */
  const handlePickup = useCallback(
    async (code: string) => {
      if (!token || confirming || locked) {
        return;
      }
      if (code.length < OTP_LENGTH) {
        setOtpError(t('ride.otpIncomplete'));
        return;
      }

      setConfirming(true);
      setOtpError(null);
      try {
        setRide(await pickupOutstationRide(token, rideId, code));
        setOtp('');
      } catch (err) {
        const apiStatus = err instanceof ApiError ? err.status : 0;

        if (apiStatus === 423) {
          // Permanent for this trip — the only way out is cancelling.
          setLocked(true);
          setOtpError(
            err instanceof Error ? err.message : t('outstationRide.otpLocked'),
          );
        } else if (apiStatus === 409) {
          // `/start` never landed, so there is nothing to confirm yet. Drop
          // back to `assigned` and let the driver set off properly.
          patch({ rideStatus: 'assigned' });
          setOtp('');
          notify(t('outstationRide.startFirst'));
        } else if (apiStatus === 403 || apiStatus === 404) {
          notify(
            err instanceof Error ? err.message : t('outstationRide.loadFailed'),
          );
          navigation.goBack();
        } else {
          const left = (err as OutstationOtpError).attemptsRemaining;
          setOtpError(
            typeof left === 'number'
              ? t('ride.otpIncorrect', { count: left })
              : err instanceof Error
                ? err.message
                : t('outstationRide.otpFailed'),
          );
          setOtp('');
        }
      } finally {
        setConfirming(false);
      }
    },
    [confirming, locked, navigation, patch, rideId, t, token],
  );

  /** `/complete` — the swipe is the confirmation; see `handleStart`. */
  const handleComplete = useCallback(async () => {
    if (!token || completing) {
      return;
    }
    setCompleting(true);
    try {
      const { ride: done, paymentDetails } = await completeOutstationRide(
        token,
        rideId,
      );
      goneRef.current = true;
      navigation.replace('RideSuccess', {
        rideId,
        finalFare: done.finalFare ?? ride?.finalFare,
        completedAt: done.completedAt ?? undefined,
        dropLocationName: ride?.dropLocationName,
        paymentDetails,
      });
    } catch (err) {
      // 409 = the pickup step never happened; go back to `arriving`.
      if (err instanceof ApiError && err.status === 409) {
        patch({ rideStatus: 'arriving' });
      }
      notify(
        err instanceof Error ? err.message : t('outstationRide.completeFailed'),
      );
    } finally {
      setCompleting(false);
    }
  }, [completing, navigation, patch, ride, rideId, t, token]);

  /* ------------------------------------------------ render */

  if (loading && !ride) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View className="flex-1 bg-white">
        <ScreenHeader title={t('outstationRide.title')} />
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons
            name="error-outline"
            size={40}
            color={colors.indicatorBorder}
          />
          <Text className="mt-4 text-center text-sm text-muted">
            {error ?? t('outstationRide.loadFailed')}
          </Text>
          <Pressable
            onPress={load}
            className="mt-5 rounded-xl border border-border px-6 py-3 active:bg-surface"
          >
            <Text className="text-sm font-bold text-secondary">
              {t('quickRide.retry')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const title =
    status === 'in_progress'
      ? t('outstationRide.titleTrip')
      : status === 'arriving'
        ? t('outstationRide.titlePickup')
        : t('outstationRide.titleBooked');

  return (
    <KeyboardSafeView>
      <ScreenHeader title={title} />

      {/* Sized to land inside one screen without scrolling on an ordinary
          phone — see the same note on `RideDetailsScreen`. The `ScrollView`
          stays as the safety net for small screens and large font settings. */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* The leg being driven, first: here to the pickup, then here to the
            drop. Same rule as the route card below — one destination at a
            time, the one the driver is actually going to. */}
        <RoutePreviewMap height={MAP_HEIGHT} from={driverAt} to={target} />

        {/* Then the OTP: at the pickup it is the only thing standing between
            the driver and the trip starting, so it doesn't make them scroll. */}
        {status === 'arriving' ? (
          <OtpPanel
            otp={otp}
            onChange={next => {
              setOtp(next);
              setOtpError(null);
            }}
            onComplete={handlePickup}
            error={otpError}
            locked={locked}
            busy={confirming}
          />
        ) : null}

        {/* Then the rider, the call button that goes with them, and the trip's
            own numbers underneath — those used to be the small print on a fare
            card that no longer exists. */}
        <RiderCard ride={ride} onCall={handleCall} />

        <StatusBanner status={status} />

        {status === 'assigned' ? <DepartureCard ride={ride} /> : null}

        {tracking && trackingFailed ? (
          <View
            className="mt-3 flex-row items-start rounded-2xl p-3"
            style={{ backgroundColor: colors.dangerSurface }}
          >
            <MaterialIcons
              name="location-off"
              size={16}
              color={colors.danger}
              style={{ marginTop: 1 }}
            />
            <Text
              className="ml-2 flex-1 text-[11px] leading-4"
              style={{ color: colors.danger }}
            >
              {t('outstationRide.trackingFailed')}
            </Text>
          </View>
        ) : null}

        <View
          className="mt-3 rounded-2xl border border-border bg-white p-3.5"
          style={CARD_SHADOW}
        >
          <Text className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
            {t('outstationRide.route')}
          </Text>

          {/* Both ends stay visible throughout. The driver bid on this trip
              knowing where it goes — and on a 400 km run they need it to plan
              fuel and stops, not just at the moment they set off. */}
          <RouteLine
            compact
            pickup={ride.pickupLocationName}
            drop={ride.dropLocationName}
            emphasis={phase}
          />

          {/* Directions to the leg being driven — the pickup until the rider is
              aboard, the drop from then on.

              The drop offers both navigators side by side rather than behind a
              menu: it is one tap either way, and a driver who has already
              decided which they use should not have to open a sheet to say so
              again at the start of every long run. Google Maps leads because it
              is the one most will pick; the in-app option carries the plainer
              icon since it is the one that keeps them here. */}
          {phase === 'drop' ? (
            <View className="mt-3 flex-row gap-2.5">
              <View className="flex-1">
                <NavigateButton
                  label={t('outstationRide.navigateMaps')}
                  icon="open-in-new"
                  onPress={() => handleNavigate('drop', 'maps')}
                />
              </View>
              <View className="flex-1">
                <NavigateButton
                  label={t('outstationRide.navigateInApp')}
                  icon="navigation"
                  onPress={() => handleNavigate('drop', 'app')}
                />
              </View>
            </View>
          ) : (
            <View className="mt-3">
              <NavigateButton
                label={t('ride.goToPickup')}
                icon="navigation"
                onPress={() => handleNavigate('pickup')}
              />
            </View>
          )}

          {phase === 'drop' ? (
            <Text className="mt-2 text-center text-[10px] leading-4 text-muted">
              {t('outstationRide.navigateDropNote')}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* The action bar: what this trip pays, and the swipe that moves it on.
          The fare sits beside the swipe rather than in a card of its own — see
          the same bar on `RideDetailsScreen`. */}
      <View
        className="flex-row items-center border-t border-border bg-white px-4 pt-2.5"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        {/* Capped: the swipe next to it needs a track long enough to be worth
            swiping, and an outstation fare runs to five figures. */}
        <View className="mr-3 max-w-[104px]">
          <Text className="text-[9px] font-bold uppercase tracking-wide text-muted">
            {t('ride.youEarn')}
          </Text>
          <Text
            className="text-[19px] font-extrabold leading-6 text-secondary"
            numberOfLines={1}
          >
            {rupees(ride.finalFare ?? ride.offeredFare)}
          </Text>
        </View>

        <View className="flex-1">
          {status === 'assigned' ? (
            <SwipeAction
              compact
              label={t('outstationRide.start')}
              icon="play-arrow"
              loading={starting}
              onConfirm={handleStart}
            />
          ) : status === 'arriving' ? (
            <SwipeAction
              compact
              label={t('outstationRide.confirmPickup')}
              icon="how-to-reg"
              loading={confirming}
              disabled={locked || otp.length < OTP_LENGTH}
              onConfirm={() => handlePickup(otp)}
            />
          ) : (
            <SwipeAction
              compact
              label={t('outstationRide.complete')}
              icon="check-circle"
              loading={completing}
              onConfirm={handleComplete}
            />
          )}
        </View>
      </View>
    </KeyboardSafeView>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/**
 * Directions to the leg the driver is on.
 *
 * Sized to survive being one of a pair: on the drop leg two of these share the
 * row, so the label is clipped to a line rather than wrapping the button into a
 * different height than its neighbour.
 */
function NavigateButton({
  label,
  icon = 'navigation',
  onPress,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center justify-center rounded-xl border px-2.5 py-2.5 active:opacity-70"
      style={{ borderColor: colors.secondary }}
    >
      <MaterialIcons name={icon} size={16} color={colors.secondary} />
      <Text
        className="ml-1.5 shrink text-[13px] font-bold text-secondary"
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Which stage the trip is at — and, for `arriving`, that the rider can see
 * this driver moving. That last part is worth stating: it is invisible
 * otherwise, and it is the only stage where it is true.
 */
function StatusBanner({ status }: { status: OutstationRideStatus }) {
  const { t } = useTranslation();

  const COPY: Partial<
    Record<OutstationRideStatus, { icon: string; fg: string; bg: string; text: string }>
  > = {
    assigned: {
      icon: 'event-available',
      fg: colors.warning,
      bg: colors.warningSurface,
      text: t('outstationRide.bannerAssigned'),
    },
    arriving: {
      icon: 'my-location',
      fg: colors.success,
      bg: colors.successSurface,
      text: t('outstationRide.bannerArriving'),
    },
    in_progress: {
      icon: 'local-taxi',
      fg: colors.success,
      bg: colors.successSurface,
      text: t('outstationRide.bannerInProgress'),
    },
  };

  const copy = COPY[status];
  if (!copy) {
    return null;
  }

  return (
    <View
      className="mt-3 flex-row items-center rounded-2xl px-3 py-2"
      style={{ backgroundColor: copy.bg }}
    >
      <MaterialIcons name={copy.icon} size={16} color={copy.fg} />
      <Text
        className="ml-2 flex-1 text-[11px] font-bold leading-4"
        style={{ color: copy.fg }}
      >
        {copy.text}
      </Text>
    </View>
  );
}

/** When to set off. The headline of a trip nobody is driving to yet. */
function DepartureCard({ ride }: { ride: OutstationRide }) {
  const { t } = useTranslation();

  const departs = departureLabel(ride.pickupAt, t);
  const lead = leadTime(ride.pickupAt, t);

  return (
    <View
      className="mt-3 rounded-2xl border border-border bg-white p-3.5"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-end">
        <View className="flex-1">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
            {t('outstationRide.departs')}
          </Text>
          <Text className="text-base font-extrabold text-secondary">
            {departs ?? '—'}
          </Text>
        </View>

        {/* Beside the departure rather than under it — two short lines that
            answer the same question don't need two rows. */}
        {lead ? (
          <Text className="ml-2 text-[11px] font-semibold text-muted">
            {lead}
          </Text>
        ) : null}
      </View>

      <Text className="mt-2 border-t border-border pt-2 text-[10px] leading-4 text-muted">
        {t('outstationRide.departsNote')}
      </Text>
    </View>
  );
}

/**
 * Who is being driven, and what the job is.
 *
 * The trip's numbers sit under the rider rather than in a card of their own:
 * distance, time and vehicle class are read once, at a glance, and they were
 * the small print on a fare card that has been folded into the action bar.
 */
function RiderCard({
  ride,
  onCall,
}: {
  ride: OutstationRide;
  onCall: () => void;
}) {
  const { t } = useTranslation();
  const rider = ride.bookedBy;
  const initial = rider?.name?.trim().charAt(0).toUpperCase();

  const details = summaryLine([
    distance(ride.estimatedDistanceKm),
    duration(ride.estimatedDurationMin),
    ride.vehicleTypeId?.name,
  ]);

  return (
    <View
      className="mt-3 rounded-2xl border border-border bg-white p-3"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center">
        {rider?.profileImageUrl ? (
          <Image
            source={{ uri: rider.profileImageUrl }}
            className="h-10 w-10 rounded-full"
          />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-full bg-surface">
            <Text className="text-base font-extrabold text-secondary">
              {initial ?? '?'}
            </Text>
          </View>
        )}

        <View className="ml-2.5 flex-1">
          <Text className="text-[9px] font-bold uppercase tracking-wide text-muted">
            {t('ride.rider')}
          </Text>
          <Text
            className="text-[15px] font-bold text-secondary"
            numberOfLines={1}
          >
            {rider?.name ?? t('ride.riderFallback')}
          </Text>
        </View>

        {rider?.phoneNumber ? (
          <Pressable
            onPress={onCall}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
            style={{ backgroundColor: colors.successSurface }}
          >
            <MaterialIcons name="call" size={19} color={colors.success} />
          </Pressable>
        ) : null}
      </View>

      {details ? (
        <Text className="mt-2 border-t border-border pt-2 text-[11px] font-semibold text-muted">
          {details}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The rider reads out a 4-digit code. After 5 wrong tries the trip is locked
 * for good, so the panel stops offering the field and points at Cancel instead.
 */
function OtpPanel({
  otp,
  onChange,
  onComplete,
  error,
  locked,
  busy,
}: {
  otp: string;
  onChange: (digits: string) => void;
  onComplete: (digits: string) => void;
  error: string | null;
  locked: boolean;
  busy: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View
      className="mt-3 rounded-2xl border border-border bg-white p-3.5"
      style={CARD_SHADOW}
    >
      <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {t('outstationRide.otpTitle')}
      </Text>
      <Text className="mt-0.5 text-[12px] leading-4 text-muted">
        {locked ? t('outstationRide.otpLockedBody') : t('outstationRide.otpBody')}
      </Text>

      <View className="mt-2.5">
        <OtpBoxes
          value={otp}
          onChange={onChange}
          onComplete={onComplete}
          length={OTP_LENGTH}
          disabled={locked || busy}
          invalid={error !== null}
        />
      </View>

      {error ? (
        <View
          className="mt-2.5 flex-row items-start rounded-xl px-3 py-2"
          style={{ backgroundColor: colors.dangerSurface }}
        >
          <MaterialIcons
            name={locked ? 'lock' : 'error-outline'}
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
    </View>
  );
}
