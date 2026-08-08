import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NavigationContainerRef } from '@react-navigation/native';

import { driverSocket } from '../services/driverSocket';
import {
  currentHomeTab,
  onHomeTabChange,
  setHomeTab,
  type HomeTab,
} from '../services/homeTab';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

/**
 * "A ride just came in" — for a driver who is inside the app but not looking at
 * the list it landed on.
 *
 * This is the third surface for the same event, and the three do not overlap:
 *
 * | Where the driver is | What tells them |
 * |---|---|
 * | In another app, or the app is backgrounded | the overlay card (`rideOverlay`) |
 * | Process gone entirely | the FCM notification (`pushService`) |
 * | **In the app, on some other screen** | **this** |
 *
 * The middle case is the one that had nothing. A driver on Profile, History, or
 * an outstation trip screen got a card that appeared silently on a tab they
 * were not looking at, and found it whenever they next wandered back.
 *
 * It is a snackbar rather than a modal on purpose: a QuickRide request expires
 * in seconds, so the thing it must not do is take the screen away from whatever
 * the driver was in the middle of. One line, one tap, gone on its own.
 */

type Props = {
  /**
   * Read for the current route and used to navigate. A ref rather than
   * `useNavigation` because this renders as a sibling of the navigator, not
   * inside it — it has to sit above every screen to be seen from all of them.
   */
  navigationRef: NavigationContainerRef<RootStackParamList>;
};

/** Long enough to read and reach; short enough not to sit over the UI. */
const VISIBLE_MS = 6000;

/**
 * A ride type, and how many have arrived since the bar went up.
 *
 * Counting rather than queueing: requests arrive in bursts when a driver is
 * parked somewhere busy, and four bars in a row — each replacing the last — is
 * worse than one that says four.
 */
type Alert = { tab: HomeTab; count: number };

export default function NewRideAlert({ navigationRef }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [alert, setAlert] = useState<Alert | null>(null);

  /**
   * Whether this request earns a bar. Every "no" here is a case some *other*
   * surface already has, or one where the driver can see the ride anyway.
   */
  const earnsAlert = useCallback(
    (tab: HomeTab): boolean => {
      // Not on screen — the overlay and the notification own this case, and
      // both are better than a bar nobody is there to see.
      if (AppState.currentState !== 'active') {
        return false;
      }

      // Nothing has mounted yet, so there is no screen to be on the wrong one
      // of — and asking the container for a route before it is ready throws.
      if (!navigationRef.isReady()) {
        return false;
      }
      const route = navigationRef.getCurrentRoute()?.name;

      // Full-screen turn-by-turn. The driver is mid-manoeuvre on a road, and
      // dropping a tappable bar over the guidance is the one place where this
      // being helpful is worse than it being absent.
      if (route === 'Navigate') {
        return false;
      }

      // Already looking at the list it landed on. The card itself is on screen
      // with the fare and the bid slider — the bar would announce something the
      // driver is currently reading, and cover it doing so.
      if (route === 'Home' && currentHomeTab() === tab) {
        return false;
      }

      return true;
    },
    [navigationRef],
  );

  useEffect(() => {
    const announce = (tab: HomeTab) => {
      if (!earnsAlert(tab)) {
        return;
      }
      setAlert(previous =>
        // A second QuickRide while a QuickRide bar is up counts up. A trip of
        // the *other* product replaces it — they go to different tabs, so one
        // bar cannot stand for both.
        previous?.tab === tab
          ? { tab, count: previous.count + 1 }
          : { tab, count: 1 },
      );
    };

    const off = [
      driverSocket.on('ride:request', () => announce('quickRide')),
      driverSocket.on('outstation:request', () => announce('outstation')),

      // The driver got to the tab by themselves — by tapping the segmented
      // control, or by following this bar. Either way the ride is in front of
      // them now and the bar has nothing left to say.
      onHomeTabChange(tab => {
        setAlert(previous => (previous?.tab === tab ? null : previous));
      }),
    ];

    return () => off.forEach(unsubscribe => unsubscribe());
  }, [earnsAlert]);

  // Restarted on every change, so a second ride arriving at 5s buys the bar a
  // fresh window rather than leaving the new count on screen for one second.
  useEffect(() => {
    if (!alert) {
      return;
    }
    const timer = setTimeout(() => setAlert(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [alert]);

  const open = useCallback(() => {
    const tab = alert?.tab;
    setAlert(null);
    if (!tab || !navigationRef.isReady()) {
      return;
    }
    // Order matters: the tab is set first so the home screen is already showing
    // the right half when it comes forward, rather than switching under the
    // driver a frame after they land on it.
    setHomeTab(tab);
    // `navigate` rather than `push` — from a pushed screen this pops back to the
    // tabs the driver already had, and from the tabs themselves it is a no-op
    // beyond the tab switch above.
    navigationRef.navigate('Main', { screen: 'Home' });
  }, [alert, navigationRef]);

  return (
    <AlertBar
      alert={alert}
      top={insets.top}
      label={
        alert
          ? t(`rideAlert.${alert.tab}`, { count: alert.count })
          : ''
      }
      action={t('rideAlert.view')}
      dismissLabel={t('rideAlert.dismiss')}
      onPress={open}
      onDismiss={() => setAlert(null)}
    />
  );
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

/**
 * Kept mounted and animated between states rather than mounted on demand, so
 * the bar can play its way *out* — an element that unmounts on dismissal
 * vanishes mid-animation, which reads as a flicker rather than a dismissal.
 */
function AlertBar({
  alert,
  top,
  label,
  action,
  dismissLabel,
  onPress,
  onDismiss,
}: {
  alert: Alert | null;
  top: number;
  label: string;
  action: string;
  dismissLabel: string;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;

  // The last text the bar carried, held through the exit animation: clearing it
  // with the alert would blank the words while the bar is still sliding away.
  const [shown, setShown] = useState({ label, action });
  if (alert && (shown.label !== label || shown.action !== action)) {
    setShown({ label, action });
  }

  useEffect(() => {
    Animated.timing(slide, {
      toValue: alert ? 1 : 0,
      duration: alert ? 240 : 180,
      easing: alert ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [alert, slide]);

  return (
    <Animated.View
      // `box-none` is what keeps this from swallowing taps meant for the screen
      // underneath: the wrapper spans the top of every screen in the app, and
      // only the card inside it is meant to be touchable.
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top,
          opacity: slide,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [-90, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${shown.label}. ${shown.action}`}
        // Hidden from the reader as well as from touch while it is away, so a
        // screen reader doesn't find a bar that is not on screen.
        accessibilityElementsHidden={!alert}
        importantForAccessibility={alert ? 'yes' : 'no-hide-descendants'}
        pointerEvents={alert ? 'auto' : 'none'}
        className="flex-row items-center rounded-2xl px-3.5 py-3 active:opacity-90"
        style={styles.bar}
      >
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.tertiary }}
        >
          <MaterialIcons name="notifications-active" size={19} color="#fff" />
        </View>

        <Text
          className="ml-3 flex-1 text-[13px] font-bold text-black"
          numberOfLines={2}
        >
          {shown.label}
        </Text>

        

        {/* Its own hit area, so dismissing never places a bid-shaped tap on the
            card underneath by landing a pixel outside the ✕. */}
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          className="ml-2.5 active:opacity-60"
        >
          <MaterialIcons name="close" size={18} color="rgba(0,0,0,0.65)" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** Spans the top of whatever screen is up; `top` is the safe-area inset. */
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  /**
   * Navy on a strong shadow: it lands on whatever screen the driver happened to
   * be on — a white list, a map, a photo — and needs to read as a layer above
   * all of them rather than as part of any.
   */
  bar: {
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
