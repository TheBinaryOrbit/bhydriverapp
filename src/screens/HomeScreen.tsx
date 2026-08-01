import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import SegmentedTabs from '../components/SegmentedTabs';
import { useAuth } from '../hooks/useAuth';
import OutstationTab from './home/OutstationTab';
import QuickRideTab from './home/QuickRideTab';

type HomeTab = 'quickRide' | 'outstation';

/**
 * The driver's home. Two products share this screen — QuickRide (live, bid-on
 * demand) and Outstation (long-distance) — switched by the pill at the top.
 *
 * Both panels are hidden rather than unmounted, and deliberately not a
 * navigator: each holds the socket subscriptions that pull the driver into a
 * ride they just won, and each runs its own `/live` resume. Lazy-mounting
 * Outstation would mean a driver who force-quit mid-trip and reopened onto the
 * QuickRide tab never resumes it — and while an outstation trip is `arriving`,
 * that resume is the only thing keeping the rider's map alive.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { token, driver } = useAuth();

  const [tab, setTab] = useState<HomeTab>('quickRide');

  const firstName = driver?.name?.trim().split(/\s+/)[0];

  return (
    <Screen className="bg-secondary" bottom={false}>
      <View className="bg-secondary px-5 pb-4 pt-3">
        <Text className="text-2xl font-extrabold text-white">
          {firstName
            ? t('home.greetingNamed', { name: firstName })
            : t('home.greeting')}
        </Text>
        <Text className="mt-0.5 text-[13px] text-white/70">
          {t('home.subtitle')}
        </Text>

        <View className="mt-4">
          <SegmentedTabs<HomeTab>
            value={tab}
            onChange={setTab}
            tabs={[
              {
                key: 'quickRide',
                label: t('home.tabs.quickRide'),
                icon: 'bolt',
              },
              {
                key: 'outstation',
                label: t('home.tabs.outstation'),
                icon: 'map',
              },
            ]}
          />
        </View>
      </View>

      {/* The rounded lip is what makes the navy header read as a card the body
          slides under, matching the profile and onboarding surfaces. */}
      <View className="flex-1 overflow-hidden rounded-t-3xl bg-white">
        {/* Hidden, not unmounted: whichever tab the driver is looking at, both
            must keep listening for the ride they just won. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            tab === 'quickRide' ? null : styles.hidden,
          ]}
        >
          <QuickRideTab token={token} />
        </View>

        <View
          style={[
            StyleSheet.absoluteFill,
            tab === 'outstation' ? null : styles.hidden,
          ]}
        >
          <OutstationTab token={token} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
});
