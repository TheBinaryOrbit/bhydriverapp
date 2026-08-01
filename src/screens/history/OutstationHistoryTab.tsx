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
import { useOutstationHistory } from '../../hooks/useRideHistory';
import type { OutstationHistoryFilter } from '../../services/outstationService';
import { colors } from '../../theme/colors';
import { presetRange } from '../../utils/dateFilters';

type Props = { token: string | null };

const NO_FILTER: HistoryFilterValue = { preset: 'all', statuses: [] };

/** Which timestamp the date range is measured against. */
type SortBy = 'createdAt' | 'pickupAt';
const SORTS: SortBy[] = ['createdAt', 'pickupAt'];

/**
 * Past outstation trips — `GET /outstation-rides/my`.
 *
 * The one control QuickRide has no use for is `by`. An outstation trip has two
 * dates that can be weeks apart — when it was booked and when it departs — so
 * "trips I picked up last month" and "trips that ran last month" are different
 * questions, and the date filter is meaningless until the driver says which
 * one they meant.
 */
export default function OutstationHistoryTab({ token }: Props) {
  const { t } = useTranslation();

  const [filter, setFilter] = useState<HistoryFilterValue>(NO_FILTER);
  const [by, setBy] = useState<SortBy>('createdAt');
  const [sheetOpen, setSheetOpen] = useState(false);

  // The query the API actually gets. Memoised because the hook refetches
  // whenever this changes identity, and the preset resolves to fresh dates on
  // every call — "today" has to mean today, not the day the tab was opened.
  const query = useMemo<OutstationHistoryFilter>(
    () => ({
      ...presetRange(filter.preset),
      status: filter.statuses.length > 0 ? filter.statuses : undefined,
      // Only send it when it changes something: with no date range there is
      // nothing for `by` to apply to.
      by: filter.preset === 'all' ? undefined : by,
    }),
    [by, filter],
  );

  const { rides, loading, refreshing, error, refresh } = useOutstationHistory(
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

      {/* Only offered once a date range exists — otherwise it is a control
          that changes nothing. */}
      {filter.preset !== 'all' ? (
        <View className="flex-row items-center px-5 pb-3">
          <Text className="mr-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            {t('history.filter.byLabel')}
          </Text>
          {SORTS.map(key => {
            const on = by === key;
            return (
              <Pressable
                key={key}
                onPress={() => setBy(key)}
                className={`mr-2 rounded-full border px-3 py-1.5 active:opacity-70 ${
                  on ? 'bg-tertiary/10' : ''
                }`}
                style={{ borderColor: on ? colors.tertiary : colors.border }}
              >
                <Text
                  className="text-[11px] font-bold"
                  style={{ color: on ? colors.tertiary : colors.muted }}
                >
                  {t(`history.filter.by.${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
                {t('outstation.tripCount', { count: rides.length })}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <RideHistoryCard ride={item} showDeparture />
          )}
          // The error replaces the list only when there is nothing to show; a
          // failed refresh leaves the trips the driver already had on screen.
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
 * Nothing to show. "No trips yet" is wrong when the driver has trips and simply
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
          name={filtered ? 'filter-list-off' : 'map'}
          size={34}
          color={colors.indicatorBorder}
        />
      </View>

      <Text className="mt-5 text-base font-bold text-secondary">
        {filtered ? t('history.noMatchTitle') : t('history.outstationTitle')}
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        {filtered ? t('history.noMatchBody') : t('history.outstationBody')}
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
          {t('history.retry')}
        </Text>
      </Pressable>
    </View>
  );
}
