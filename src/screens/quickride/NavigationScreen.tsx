import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  NavigationSessionStatus,
  NavigationView,
  RouteStatus,
  TravelMode,
  useNavigation,
} from '@googlemaps/react-native-navigation-sdk';

import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Navigate'>;

type Phase = 'starting' | 'routing' | 'guiding' | 'failed';

export default function NavigationScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { destination, title } = route.params;

  const {
    navigationController,
    setOnArrival,
    setOnLocationChanged,
    removeAllListeners,
  } = useNavigation();

  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState<string | null>(null);
  // The SDK status behind `message`. Several statuses share one sentence, so
  // without this a support call can't tell "phone is offline" from "our project
  // can't route" — both arrive as the same NETWORK_ERROR.
  const [code, setCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const alive = useRef(true);

  const retry = useCallback(() => {
    setPhase('starting');
    setMessage(null);
    setCode(null);
    setAttempt(n => n + 1);
  }, []);

  const setRoute = useCallback(
    (): Promise<RouteStatus> =>
      navigationController.setDestinations(
        [{ title, position: { lat: destination.lat, lng: destination.lng } }],
        {
          routingOptions: {
            travelMode: TravelMode.DRIVING,
            avoidFerries: true,
            avoidTolls: false,
          },
          displayOptions: { showDestinationMarkers: true },
        },
      ),
    [destination.lat, destination.lng, navigationController, title],
  );

  useEffect(() => {
    alive.current = true;
    let cancelled = false;

    const fail = (reason: string, status?: string) => {
      if (!cancelled) {
        setPhase('failed');
        setMessage(reason);
        setCode(status ?? null);
      }
    };

    const start = async () => {
      try {
        const accepted = await navigationController.areTermsAccepted();

        if (!accepted) {
          const agreed =
            await navigationController.showTermsAndConditionsDialog();
          if (!agreed) {
            fail(t('navigate.termsDeclined'), 'termsDeclined');
            return;
          }
        }
        if (cancelled) return;

        const status = await navigationController.init();
        if (cancelled) return;
        if (status !== NavigationSessionStatus.OK) {
          fail(sessionMessage(status, t), `init:${status}`);
          return;
        }

        setPhase('routing');
        let routeStatus = await setRoute();

        // A cold GPS can report the device's position as unknown for a few
        // seconds after the session starts; one wait-and-retry turns that into
        // a slightly slower start rather than a dead end.
        if (
          routeStatus === RouteStatus.LOCATION_DISABLED ||
          routeStatus === RouteStatus.LOCATION_UNKNOWN
        ) {
          await waitForFix(setOnLocationChanged);
          if (cancelled) return;
          routeStatus = await setRoute();
        }
        if (cancelled) return;

        if (routeStatus !== RouteStatus.OK) {
          fail(routeMessage(routeStatus, t), `route:${routeStatus}`);
          return;
        }

        await navigationController.startGuidance();
        if (!cancelled) {
          setPhase('guiding');
          setMessage(null);
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), 'exception');
      }
    };

    start();

    return () => {
      cancelled = true;
      alive.current = false;
      removeAllListeners();
      navigationController.stopGuidance().catch(() => {});
      navigationController.cleanup().catch(() => {});
    };
  }, [
    attempt,
    navigationController,
    removeAllListeners,
    setOnLocationChanged,
    setRoute,
    t,
  ]);

  useEffect(() => {
    setOnArrival(() => {
      notify(t('navigate.arrived'));
      if (alive.current) {
        navigation.goBack();
      }
    });
    return () => setOnArrival(null);
  }, [navigation, setOnArrival, t]);

  return (
    <View className="flex-1 bg-black">
      {/* `targetSdkVersion 36` means Android draws this window edge to edge and
          ignores the opt-out, so an unpadded `NavigationView` puts its own
          trip-progress bar underneath the system navigation bar. The SDK
          exposes no padding prop, so the whole view is inset instead. */}
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <NavigationView style={{ flex: 1 }} />

        {/* Laid out below the map rather than floating over it: the SDK owns
            both the top of its view (maneuver card) and the bottom
            (trip-progress bar), so anything overlaid covers what the driver is
            reading. Only while guidance is up — every other phase sits behind
            the overlay below, which carries its own way out. */}
        {phase === 'guiding' ? (
          <View className="bg-white px-5 py-3">
            <Pressable
              onPress={() => navigation.goBack()}
              className="flex-row items-center justify-center rounded-xl py-3.5 active:opacity-80"
              style={{ backgroundColor: colors.secondary }}
            >
              <MaterialIcons name="close" size={18} color="#ffffff" />
              <Text className="ml-2 text-sm font-bold text-white">
                {t('navigate.close')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      {/* Covers the map until guidance is actually live — a half-drawn map with
          no route on it reads as a broken screen to the driver. */}
      {phase !== 'guiding' ? (
        <View className="absolute inset-0 items-center justify-center bg-white px-8">
          {phase === 'failed' ? (
            <>
              <View
                className="h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.dangerSurface }}
              >
                <MaterialIcons
                  name="error-outline"
                  size={30}
                  color={colors.danger}
                />
              </View>

              <Text className="mt-5 text-center text-base font-bold text-secondary">
                {message ?? t('navigate.failed')}
              </Text>
              {code ? (
                <Text className="mt-2 text-center text-[11px] text-muted">
                  {t('navigate.code', { code })}
                </Text>
              ) : null}

              <Pressable
                onPress={retry}
                className="mt-7 w-full items-center rounded-xl py-3.5 active:opacity-80"
                style={{ backgroundColor: colors.secondary }}
              >
                <Text className="text-sm font-bold text-white">
                  {t('navigate.retry')}
                </Text>
              </Pressable>
              {/* Guidance is optional — the driver still has the ride screen,
                  the rider's number and the OTP without it. */}
              <Pressable
                onPress={() => navigation.goBack()}
                className="mt-2 w-full items-center py-3 active:opacity-60"
              >
                <Text className="text-sm font-bold text-muted">
                  {t('navigate.back')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.secondary} />
              <Text className="mt-5 text-center text-base font-bold text-secondary">
                {phase === 'routing'
                  ? t('navigate.routing')
                  : t('navigate.starting')}
              </Text>
              <Text
                className="mt-1.5 text-center text-[13px] text-muted"
                numberOfLines={2}
              >
                {title}
              </Text>
              {/* Routing can sit for a while on a cold GPS; without this the
                  driver has no way off the screen until it resolves. */}
              <Pressable
                onPress={() => navigation.goBack()}
                className="mt-7 items-center px-6 py-3 active:opacity-60"
              >
                <Text className="text-sm font-bold text-muted">
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Resolves on the first location update, or after 10s either way. */
function waitForFix(
  setOnLocationChanged: (callback: (() => void) | null) => void,
): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      setOnLocationChanged(null);
      resolve();
    };
    const timer = setTimeout(done, 10000);

    setOnLocationChanged(done);
  });
}

type Translate = (key: string, vars?: Record<string, unknown>) => string;

/*
 * A note on `NETWORK_ERROR`, below.
 *
 * The Navigation SDK does not only return it when the handset is offline — it
 * is also what it returns when the request reached Google and was refused
 * (project not provisioned for the Navigation SDK, key restricted to a
 * different package/signing key, routing product not enabled). Telling the
 * driver "no connection" in that case sends them to toggle a working wifi over
 * and over on a fault they cannot fix, so the copy names the service rather
 * than the connection, and `NavigationScreen` shows the raw status alongside.
 */

function sessionMessage(status: NavigationSessionStatus, t: Translate): string {
  switch (status) {
    case NavigationSessionStatus.NOT_AUTHORIZED:
      return t('navigate.notAuthorized');
    case NavigationSessionStatus.LOCATION_PERMISSION_MISSING:
      return t('navigate.noPermission');
    case NavigationSessionStatus.TERMS_NOT_ACCEPTED:
      return t('navigate.termsDeclined');
    case NavigationSessionStatus.NETWORK_ERROR:
      return t('navigate.serviceUnreachable');
    default:
      return t('navigate.failed');
  }
  
}

function routeMessage(status: RouteStatus, t: Translate): string {
  switch (status) {
    case RouteStatus.NO_ROUTE_FOUND:
      return t('navigate.noRoute');
    case RouteStatus.NETWORK_ERROR:
      return t('navigate.routeUnreachable');
    case RouteStatus.QUOTA_CHECK_FAILED:
      return t('navigate.quotaError');
    case RouteStatus.LOCATION_DISABLED:
    case RouteStatus.LOCATION_UNKNOWN:
      return t('navigate.noFix');
    // The waypoint we send is always a lat/lng from the ride, so these mean the
    // ride's coordinates are unusable — not something a retry will fix.
    case RouteStatus.WAYPOINT_ERROR:
    case RouteStatus.INVALID_PLACE_ID:
    case RouteStatus.DUPLICATE_WAYPOINTS_ERROR:
      return t('navigate.badDestination');
    default:
      return t('navigate.failed');
  }
}