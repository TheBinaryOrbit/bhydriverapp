import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import HistoryFilterBar from '../../components/history/HistoryFilterBar';
import HistoryFilterSheet, {
  type HistoryFilterValue,
} from '../../components/history/HistoryFilterSheet';
import RideHistoryCard from '../../components/history/RideHistoryCard';
import { useRideHistory } from '../../hooks/useRideHistory';
import type { RideHistoryFilter } from '../../services/quickRideService';
import { colors } from '../../theme/colors';
import { presetRange } from '../../utils/dateFilters';

type Props = { token: string | null };

const NO_FILTER: HistoryFilterValue = { preset: 'all', statuses: [] };

/** Past QuickRides — `GET /quick-rides/my`, newest first. */
export default function QuickRideHistoryTab({ token }: Props) {
  const { t } = useTranslation();

  const [filter, setFilter] = useState<HistoryFilterValue>(NO_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The query the API actually gets. Memoised because `useRideHistory` refetches
  // whenever this changes identity, and the preset resolves to fresh dates on
  // every call — "today" has to mean today, not the day the tab was opened.
  const query = useMemo<RideHistoryFilter>(
    () => ({
      ...presetRange(filter.preset),
      status: filter.statuses.length > 0 ? filter.statuses : undefined,
    }),
    [filter],
  );

  const { rides, loading, refreshing, error, refresh } = useRideHistory(
    token,
    query,
  );

  const filtered = filter.preset !== 'all' || filter.statuses.length > 0;

  // One selected status reads better as its own name than as a count.
  const statusLabel =
    filter.statuses.length === 0
      ? t('history.filter.allStatuses')
      : filter.statuses.length === 1
        ? t(`history.status.${filter.statuses[0]}`)
        : t('history.filter.statusCount', { count: filter.statuses.length });

  return (
    <View className="flex-1 bg-white">
      <HistoryFilterBar
        dateLabel={t(`history.filter.presets.${filter.preset}`)}
        statusLabel={statusLabel}
        dateActive={filter.preset !== 'all'}
        statusActive={filter.statuses.length > 0}
        onOpen={() => setSheetOpen(true)}
        onClear={() => setFilter(NO_FILTER)}
      />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.secondary} />
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={ride => ride._id}
          contentContainerStyle={{
            paddingHorizontal: 20,
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
          ListHeaderComponent={
            rides.length > 0 ? (
              <Text className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                {t('history.count', { count: rides.length })}
              </Text>
            ) : null
          }
          renderItem={({ item }) => <RideHistoryCard ride={item} />}
          // The error replaces the list only when there is nothing to show;
          // a failed refresh leaves the rides the driver already had on screen.
          ListEmptyComponent={
            error ? (
              <ErrorState message={error} onRetry={refresh} />
            ) : (
              <EmptyState
                filtered={filtered}
                onClear={() => setFilter(NO_FILTER)}
              />
            )
          }
        />
      )}

      <HistoryFilterSheet
        visible={sheetOpen}
        value={filter}
        onApply={next => {
          setFilter(next);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

/**
 * Nothing to show. "No rides yet" is wrong when the driver has rides and simply
 * filtered them all out, so the filtered case gets its own message and a way
 * back out.
 */
function EmptyState({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center px-6 py-16">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surface }}
      >
        <MaterialIcons
          name={filtered ? 'filter-list-off' : 'history'}
          size={34}
          color={colors.indicatorBorder}
        />
      </View>

      <Text className="mt-5 text-base font-bold text-secondary">
        {filtered ? t('history.noMatchTitle') : t('history.emptyTitle')}
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        {filtered ? t('history.noMatchBody') : t('history.emptyBody')}
      </Text>

      {filtered ? (
        <Pressable
          onPress={onClear}
          className="mt-5 rounded-xl border border-border px-5 py-3 active:bg-surface"
        >
          <Text className="text-sm font-bold text-secondary">
            {t('history.filter.clearAll')}
          </Text>
        </Pressable>
      ) : null}
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
        {t('history.errorTitle')}
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        {message}
      </Text>

      <Pressable
        onPress={onRetry}
        className="mt-5 rounded-xl border border-border px-5 py-3 active:bg-surface"
      >
        <Text className="text-sm font-bold text-secondary">
          {t('history.retry')}
        </Text>
      </Pressable>
    </View>
  );
}
