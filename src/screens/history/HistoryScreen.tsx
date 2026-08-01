import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Screen from '../../components/Screen';
import SegmentedTabs from '../../components/SegmentedTabs';
import { useAuth } from '../../hooks/useAuth';
import OutstationHistoryTab from './OutstationHistoryTab';
import QuickRideHistoryTab from './QuickRideHistoryTab';

type HistoryTab = 'quickRide' | 'outstation';

/**
 * Past rides, split by product the same way the home screen is — QuickRide and
 * Outstation — so the driver switches between them with the same control in the
 * same place.
 */
export default function HistoryScreen() {
  const { t } = useTranslation();
  const { token } = useAuth();

  const [tab, setTab] = useState<HistoryTab>('quickRide');
  const [visited, setVisited] = useState({ outstation: false });

  const selectTab = (next: HistoryTab) => {
    setTab(next);
    if (next === 'outstation') {
      setVisited(previous => ({ ...previous, outstation: true }));
    }
  };

  return (
    <Screen className="bg-secondary" bottom={false}>
      <View className="bg-secondary px-5 pb-4 pt-3">
        <Text className="text-2xl font-extrabold text-white">
          {t('history.title')}
        </Text>
        <Text className="mt-0.5 text-[13px] text-white/70">
          {t('history.subtitle')}
        </Text>

        <View className="mt-4">
          <SegmentedTabs<HistoryTab>
            value={tab}
            onChange={selectTab}
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

      <View className="flex-1 overflow-hidden rounded-t-3xl bg-white">
        {/* Hidden rather than unmounted so switching tabs keeps the list and
            its scroll position instead of refetching `/quick-rides/my`. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            tab === 'quickRide' ? null : styles.hidden,
          ]}
        >
          <QuickRideHistoryTab token={token} />
        </View>

        {visited.outstation ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              tab === 'outstation' ? null : styles.hidden,
            ]}
          >
            <OutstationHistoryTab token={token} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
});
