import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AudioGuidance,
  CameraPerspective,
  NavigationSessionStatus,
  NavigationView,
  RouteStatus,
  TravelMode,
  useNavigation,
  type NavigationViewController,
} from '@googlemaps/react-native-navigation-sdk';

import type { RootStackParamList } from '../../navigation/types';
import { getNavigationMuted, setNavigationMuted } from '../../storage/navPrefs';
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
  /** Voice guidance off — the driver's standing choice, not this trip's. */
  const [muted, setMuted] = useState(false);

  const viewController = useRef<NavigationViewController | null>(null);

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

  /**
   * Turn the navigation UI on once guidance is running.
   *
   * This is what was missing: `navigationUIEnabledPreference` defaults to
   * AUTOMATIC, which enables the maneuver card, the trip-progress footer and
   * the speed limit **only if a session was already running when the view
   * initialised**. Ours never is — the view mounts first and the session starts
   * a second or two later, off the async chain above — so the SDK left its own
   * UI switched off and the map came up as a bare map with no instructions on
   * it. Enabling it explicitly, from whichever of the two lands last, is the
   * fix.
   */
  const showNavigationUi = useCallback(() => {
    const view = viewController.current;
    if (!view || phase !== 'guiding') {
      return;
    }
    view.setNavigationUIEnabled(true).catch(() => {});
    // Follow the car, tilted, the way a driver expects guidance to sit.
    view.setFollowingPerspective(CameraPerspective.TILTED).catch(() => {});
  }, [phase]);

  useEffect(() => {
    showNavigationUi();
  }, [showNavigationUi]);

  /** The driver's saved choice, read once and applied as guidance starts. */
  useEffect(() => {
    getNavigationMuted().then(setMuted);
  }, []);

  useEffect(() => {
    if (phase !== 'guiding') {
      return;
    }
    navigationController.setAudioGuidanceType(
      muted ? AudioGuidance.SILENT : AudioGuidance.VOICE_ALERTS_AND_GUIDANCE,
    );
  }, [muted, navigationController, phase]);

  const toggleSound = useCallback(() => {
    setMuted(previous => {
      const next = !previous;
      // Nothing waits on the write: the toggle has already flipped, and a
      // failed save costs the driver one tap next time.
      setNavigationMuted(next).catch(() => {});
      return next;
    });
  }, []);

  /**
   * Arriving is announced, not acted on.
   *
   * The screen used to close itself here. It shouldn't: the SDK calls this from
   * a geofence around the destination, which trips while the driver is still
   * circling for the rider or the building — and closing the map out from under
   * them at exactly that moment is when they most need it. Leaving is the
   * driver's call, on the Close button that is already there.
   */
  useEffect(() => {
    setOnArrival(() => notify(t('navigate.arrived')));
    return () => setOnArrival(null);
  }, [setOnArrival, t]);

  return (
    <View className="flex-1 bg-black">
      {/* `targetSdkVersion 36` means Android draws this window edge to edge and
          ignores the opt-out, so an unpadded `NavigationView` puts its own
          trip-progress bar underneath the system navigation bar. The SDK
          exposes no padding prop, so the whole view is inset instead. */}
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        {/* Breathing room top and bottom: the SDK draws its maneuver card hard
            against the top of its view and the trip-progress bar hard against
            the bottom, and both read as clipped when they sit flush with the
            status bar and the gesture bar. */}
        <View style={styles.stage}>
          <NavigationView
            style={styles.map}
            onNavigationViewControllerCreated={next => {
              viewController.current = next;
              showNavigationUi();
            }}
            // The SDK's own furniture, asked for by name rather than left to
            // defaults: the instruction card, the trip-progress footer, the
            // speed limit and the recenter button are the whole reason a driver
            // is looking at this screen instead of the ride card.
            headerEnabled
            footerEnabled
            tripProgressBarEnabled
            speedLimitIconEnabled
            recenterButtonEnabled
          />

          {/* Corner buttons rather than a bar under the map: the map is what
              the driver is reading, and a full-width row below it cost the map
              the height instead. Inset to clear the right-hand end of the
              maneuver card. Only while guidance is up — every other phase sits
              behind the overlay below, which carries its own way out. */}
          {phase === 'guiding' ? (
            <View style={styles.controls}>
              <Pressable
                onPress={toggleSound}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityState={{ selected: !muted }}
                accessibilityLabel={
                  muted ? t('navigate.soundOff') : t('navigate.soundOn')
                }
                style={styles.control}
                className="active:opacity-80"
              >
                <MaterialIcons
                  name={muted ? 'volume-off' : 'volume-up'}
                  size={21}
                  color={muted ? colors.muted : colors.secondary}
                />
              </Pressable>

              <Pressable
                onPress={() => navigation.goBack()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('navigate.close')}
                style={styles.control}
                className="active:opacity-80"
              >
                <MaterialIcons name="close" size={22} color={colors.secondary} />
              </Pressable>
            </View>
          ) : null}
        </View>
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

const styles = StyleSheet.create({
  /** The map, held off the status bar and the gesture bar. */
  stage: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 14,
  },
  map: {
    flex: 1,
  },
  /** Sound and close, over the map's top-right corner. */
  controls: {
    position: 'absolute',
    top: 22,
    right: 14,
    flexDirection: 'row',
    gap: 10,
  },
  /**
   * White on a shadow because it lands on whatever the map is showing — road,
   * water or a dark satellite tile — and a flat icon disappears into all three.
   */
  control: {
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});

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