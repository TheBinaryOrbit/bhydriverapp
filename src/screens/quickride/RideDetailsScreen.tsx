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
  Image,
  Platform,
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
import ScreenHeader from '../../components/ScreenHeader';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import OtpBoxes from '../../components/quickride/OtpBoxes';
import RouteLine from '../../components/quickride/RouteLine';
import RoutePreviewMap from '../../components/quickride/RoutePreviewMap';
import SwipeAction from '../../components/quickride/SwipeAction';
import {
  distance,
  duration,
  rupees,
  summaryLine,
} from '../../components/quickride/format';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import type { RootStackParamList } from '../../navigation/types';
import { ApiError } from '../../services/api';
import { driverSocket } from '../../services/driverSocket';
import {
  cancelRide,
  completeRide,
  fetchRide,
  startRide,
  type ApiErrorWithAttempts,
} from '../../services/quickRideService';
import { getToken } from '../../storage/authStorage';
import { colors } from '../../theme/colors';
import {
  toLatLng,
  type QuickRide,
  type RideStatus,
} from '../../types/quickRide';
import { callNumber } from '../../utils/maps';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'RideDetails'>;

/** 5 wrong tries (`RIDE_START_OTP_MAX_ATTEMPTS`) and the ride is locked. */
const OTP_LENGTH = 4;

/**
 * The live ride — see §6–9 of `docs/driver-quick-ride.md`.
 *
 * The screen renders **one destination at a time**, driven entirely by
 * `rideStatus`: pickup while `assigned`, drop once `in_progress`. Status
 * changes arrive twice — in the response of `start`/`complete` and again as
 * `ride:started` / `ride:completed` — so every transition here is idempotent
 * and whichever lands first wins.
 */
export default function RideDetailsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const { rideId } = route.params;

  // The socket's `bid:accepted` carries a ride complete enough to paint with,
  // so the screen is never blank while `GET /quick-rides/:id` is in flight.
  const [ride, setRide] = useState<QuickRide | null>(route.params.ride ?? null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(!route.params.ride);
  const [error, setError] = useState<string | null>(null);

  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const status: RideStatus = ride?.rideStatus ?? 'assigned';
  const phase = status === 'in_progress' ? 'drop' : 'pickup';

  /**
   * The driver's own position, for the map's first leg. Read-only — duty is
   * held on for the length of the ride, so the shared watch is already running
   * and this only subscribes to what it publishes.
   */
  const { location: driverAt } = useDriverLocation();

  /* ------------------------------------------------ loading */

  const load = useCallback(async () => {
    const stored = await getToken();
    setToken(stored);
    if (!stored) {
      return;
    }
    try {
      // The socket payload is a first paint; this is the source of truth.
      setRide(await fetchRide(stored, rideId));
      setError(null);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        // Stale screen — the ride isn't ours, or is gone.
        notify(err.message);
        navigation.goBack();
        return;
      }
      setError(err instanceof Error ? err.message : t('ride.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [navigation, rideId, t]);

  useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------------------------ live updates */

  const goneRef = useRef(false);

  // The socket handlers are registered once and would otherwise close over the
  // ride as it was on first render.
  const rideRef = useRef<QuickRide | null>(ride);
  rideRef.current = ride;

  /** Patches the local ride without a round trip — used by the socket events. */
  const patch = useCallback((changes: Partial<QuickRide>) => {
    setRide(previous => (previous ? { ...previous, ...changes } : previous));
  }, []);

  useEffect(() => {
    const mine = (id?: string) => id === rideId;

    const off = [
      driverSocket.on('ride:started', payload => {
        if (mine(payload.rideId)) {
          patch({ rideStatus: 'in_progress', startedAt: payload.startedAt });
        }
      }),

      driverSocket.on('ride:completed', payload => {
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

      driverSocket.on('ride:cancelled', payload => {
        if (!mine(payload.rideId) || goneRef.current) {
          return;
        }
        goneRef.current = true;
        notify(payload.cancellationReason ?? t('ride.cancelledByRider'));
        navigation.goBack();
      }),
    ];

    return () => off.forEach(unsubscribe => unsubscribe());
  }, [navigation, patch, rideId, t]);

  /* ------------------------------------------------ actions */

  const target = useMemo(
    () =>
      toLatLng(
        status === 'assigned' ? ride?.pickupCoordinates : ride?.dropCoordinates,
      ),
    [ride?.dropCoordinates, ride?.pickupCoordinates, status],
  );

  // Guidance runs inside the app, on the Navigation SDK. There is no hand-off
  // to the phone's Maps app at all — leaving the app mid-trip is what stops the
  // driver seeing the OTP and complete steps.
  const handleNavigate = useCallback(() => {
    if (!target) {
      notify(t('ride.noCoordinates'));
      return;
    }
    navigation.navigate('Navigate', {
      destination: target,
      title:
        (status === 'assigned'
          ? ride?.pickupLocationName
          : ride?.dropLocationName) ?? t('ride.destination'),
    });
  }, [
    navigation,
    ride?.dropLocationName,
    ride?.pickupLocationName,
    status,
    t,
    target,
  ]);

  const handleCall = useCallback(async () => {
    if (!(await callNumber(ride?.bookedBy?.phoneNumber))) {
      notify(t('ride.callFailed'));
    }
  }, [ride?.bookedBy?.phoneNumber, t]);

  const handleStart = useCallback(
    async (code: string) => {
      if (!token || starting || locked) {
        return;
      }
      if (code.length < OTP_LENGTH) {
        setOtpError(t('ride.otpIncomplete'));
        return;
      }

      setStarting(true);
      setOtpError(null);
      try {
        const { ride: started } = await startRide(token, rideId, code);
        setRide(started);
        setOtp('');
      } catch (err) {
        const apiStatus = err instanceof ApiError ? err.status : 0;

        if (apiStatus === 423) {
          // Permanent for this ride — the only way out is cancelling.
          setLocked(true);
          setOtpError(err instanceof Error ? err.message : t('ride.otpLocked'));
        } else if (apiStatus === 409) {
          // Already started elsewhere — just move to the drop phase.
          patch({ rideStatus: 'in_progress' });
          setOtp('');
        } else if (apiStatus === 403 || apiStatus === 404) {
          notify(err instanceof Error ? err.message : t('ride.loadFailed'));
          navigation.goBack();
        } else {
          const left = (err as ApiErrorWithAttempts).attemptsRemaining;
          setOtpError(
            typeof left === 'number'
              ? t('ride.otpIncorrect', { count: left })
              : err instanceof Error
                ? err.message
                : t('ride.otpFailed'),
          );
          setOtp('');
        }
      } finally {
        setStarting(false);
      }
    },
    [locked, navigation, patch, rideId, starting, t, token],
  );

  const handleComplete = useCallback( async () => {
    if (!token || completing) {
      return;
    }

    setCompleting(true);
    try {
      const { ride: done, paymentDetails } = await completeRide(
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
      // 409 = the OTP step never happened; drop back to the pickup phase.
      if (err instanceof ApiError && err.status === 409) {
        patch({ rideStatus: 'assigned' });
      }
      notify(
        err instanceof Error ? err.message : t('ride.completeFailed'),
      );
    } finally {
      setCompleting(false);
    }
  }, [completing, navigation, patch, ride, rideId, t, token]);

  const handleCancel = useCallback(() => {
    if (!token || cancelling) {
      return;
    }
    // Branch on the platform, never on `Alert.prompt` being defined: it is a
    // static method on both, and off iOS its whole body is a no-op — testing
    // it for truthiness left Android with a button that did nothing at all.
    if (Platform.OS === 'ios') {
      Alert.prompt(
        t('ride.cancelTitle'),
        t('ride.cancelBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('ride.cancelConfirm'),
            style: 'destructive',
            onPress: (reason?: string) =>
              runCancel(reason?.trim() || t('ride.cancelDefaultReason')),
          },
        ],
        'plain-text',
      );
    } else {
      // Android has no prompt; the reason is required by the API, so send a
      // sensible default rather than blocking the driver behind a form.
      Alert.alert(t('ride.cancelTitle'), t('ride.cancelBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('ride.cancelConfirm'),
          style: 'destructive',
          onPress: () => runCancel(t('ride.cancelDefaultReason')),
        },
      ]);
    }

    async function runCancel(reason: string) {
      setCancelling(true);
      try {
        await cancelRide(token!, rideId, reason);
        goneRef.current = true;
        notify(t('ride.cancelled'));
        navigation.goBack();
      } catch (err) {
        notify(err instanceof Error ? err.message : t('ride.cancelFailed'));
      } finally {
        setCancelling(false);
      }
    }
  }, [cancelling, navigation, rideId, t, token]);

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
        <ScreenHeader title={t('ride.title')} />
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons
            name="error-outline"
            size={40}
            color={colors.indicatorBorder}
          />
          <Text className="mt-4 text-center text-sm text-muted">
            {error ?? t('ride.loadFailed')}
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

  const canCancel = status === 'assigned';

  return (
    <KeyboardSafeView>
      <ScreenHeader
        title={
          status === 'in_progress' ? t('ride.titleTrip') : t('ride.titlePickup')
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* The leg being driven, first: here to the pickup, then here to the
            drop. Same rule as the address card below — one destination at a
            time, the one the driver is actually going to. */}
        <RoutePreviewMap
          from={driverAt}
          to={toLatLng(
            phase === 'pickup' ? ride.pickupCoordinates : ride.dropCoordinates,
          )}
        />

        {/* Then the OTP: at the pickup it is the only thing standing between
            the driver and starting the ride, so it doesn't make them scroll. */}
        {status === 'assigned' ? (
          <OtpPanel
            otp={otp}
            onChange={next => {
              setOtp(next);
              setOtpError(null);
            }}
            onComplete={handleStart}
            error={otpError}
            locked={locked}
            busy={starting}
          />
        ) : null}

        {/* Then the rider, and the call button that goes with them. */}
        <RiderCard ride={ride} onCall={handleCall} />

        <PhaseBanner phase={phase} />

        <FareCard ride={ride} />

        {/* One destination at a time: the drop address stays hidden until the
            trip is actually running. */}
        <View
          className="mt-4 rounded-2xl border border-border bg-white p-4"
          style={CARD_SHADOW}
        >
          <Text className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
            {status === 'assigned' ? t('ride.pickup') : t('ride.drop')}
          </Text>

          <RouteLine
            pickup={ride.pickupLocationName}
            drop={ride.dropLocationName}
            emphasis={phase}
            hideDrop={status === 'assigned'}
          />

          {/* A tap, not a swipe: opening directions is reversible, and it is
              the control the driver reaches for most often — sometimes while
              already moving. Nothing here needs protecting from a stray touch. */}
          <Pressable
            onPress={handleNavigate}
            className="mt-4 flex-row items-center justify-center rounded-xl border py-3.5 active:opacity-70"
            style={{ borderColor: colors.secondary }}
          >
            <MaterialIcons
              name="navigation"
              size={18}
              color={colors.secondary}
            />
            <Text className="ml-2 text-sm font-bold text-secondary">
              {status === 'assigned'
                ? t('ride.navigatePickup')
                : t('ride.navigateDrop')}
            </Text>
          </Pressable>
        </View>

        {canCancel ? (
          <View className="mt-6">
            <SwipeAction
              label={t('ride.cancelRide')}
              icon="close"
              tone={colors.danger}
              loading={cancelling}
              onConfirm={handleCancel}
            />
          </View>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-border bg-white px-5 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {status === 'assigned' ? (
          <SwipeAction
            label={t('ride.startRide')}
            icon="play-arrow"
            loading={starting}
            disabled={locked || otp.length < OTP_LENGTH}
            onConfirm={() => handleStart(otp)}
          />
        ) : (
          <SwipeAction
            label={t('ride.completeRide')}
            icon="check-circle"
            loading={completing}
            onConfirm={handleComplete}
          />
        )}
      </View>
    </KeyboardSafeView>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** Which leg the driver is on, stated plainly at the top of the screen. */
function PhaseBanner({ phase }: { phase: 'pickup' | 'drop' }) {
  const { t } = useTranslation();
  const pickup = phase === 'pickup';

  return (
    <View
      className="mt-4 flex-row items-center rounded-2xl px-4 py-3"
      style={{
        backgroundColor: pickup ? colors.warningSurface : colors.successSurface,
      }}
    >
      <MaterialIcons
        name={pickup ? 'directions-walk' : 'local-taxi'}
        size={18}
        color={pickup ? colors.warning : colors.success}
      />
      <Text
        className="ml-2 flex-1 text-[13px] font-bold"
        style={{ color: pickup ? colors.warning : colors.success }}
      >
        {pickup ? t('ride.phasePickup') : t('ride.phaseDrop')}
      </Text>
    </View>
  );
}

function RiderCard({ ride, onCall }: { ride: QuickRide; onCall: () => void }) {
  const { t } = useTranslation();
  const rider = ride.bookedBy;
  const initial = rider?.name?.trim().charAt(0).toUpperCase();

  return (
    <View
      className="mt-4 flex-row items-center rounded-2xl border border-border bg-white p-4"
      style={CARD_SHADOW}
    >
      {rider?.profileImageUrl ? (
        <Image
          source={{ uri: rider.profileImageUrl }}
          className="h-12 w-12 rounded-full"
        />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface">
          <Text className="text-lg font-extrabold text-secondary">
            {initial ?? '?'}
          </Text>
        </View>
      )}

      <View className="ml-3 flex-1">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">
          {t('ride.rider')}
        </Text>
        <Text
          className="mt-0.5 text-base font-bold text-secondary"
          numberOfLines={1}
        >
          {rider?.name ?? t('ride.riderFallback')}
        </Text>
      </View>

      {rider?.phoneNumber ? (
        <Pressable
          onPress={onCall}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: colors.successSurface }}
        >
          <MaterialIcons name="call" size={20} color={colors.success} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** `finalFare` is what the driver gets paid — never `offeredFare`. */
function FareCard({ ride }: { ride: QuickRide }) {
  const { t } = useTranslation();

  return (
    <View
      className="mt-4 flex-row items-center rounded-2xl border border-border bg-white p-4"
      style={CARD_SHADOW}
    >
      <View className="flex-1">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">
          {t('ride.youEarn')}
        </Text>
        <Text className="mt-0.5 text-3xl font-extrabold text-secondary">
          {rupees(ride.finalFare ?? ride.offeredFare)}
        </Text>
        <Text className="mt-1 text-xs font-semibold text-muted">
          {summaryLine([
            distance(ride.estimatedDistanceKm),
            duration(ride.estimatedDurationMin),
            ride.vehicleTypeId?.name,
          ])}
        </Text>
      </View>

      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surface }}
      >
        <MaterialIcons name="payments" size={22} color={colors.tertiary} />
      </View>
    </View>
  );
}

/**
 * The rider reads out a 4-digit code. After 5 wrong tries the ride is locked
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
      className="mt-4 rounded-2xl border border-border bg-white p-4"
      style={CARD_SHADOW}
    >
      <Text className="text-xs font-bold uppercase tracking-wide text-muted">
        {t('ride.otpTitle')}
      </Text>
      <Text className="mt-1 text-[13px] leading-5 text-muted">
        {locked ? t('ride.otpLockedBody') : t('ride.otpBody')}
      </Text>

      <View className="mt-4">
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
          className="mt-4 flex-row items-start rounded-xl px-3.5 py-3"
          style={{ backgroundColor: colors.dangerSurface }}
        >
          <MaterialIcons
            name={locked ? 'lock' : 'error-outline'}
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
    </View>
  );
}