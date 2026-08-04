import React from 'react';
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

import ScreenHeader from '../../components/ScreenHeader';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { rideMoment } from '../../components/quickride/format';
import { useAuth } from '../../hooks/useAuth';
import { useDriverReviews } from '../../hooks/useDriverReviews';
import { colors } from '../../theme/colors';
import type { DriverReview, DriverReviewSummary } from '../../types/review';

/**
 * What riders said — `GET /reviews/driver/:driverId`.
 *
 * Read-only: a driver can see their rating but has no reply, no dispute and no
 * delete, because the endpoint offers none. The headline average comes off the
 * response's `driver` block, which is computed over every review ever left, not
 * over the page on screen.
 */
export default function MyReviewsScreen() {
  const { t } = useTranslation();
  const { token, driver } = useAuth();

  const {
    summary,
    reviews,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh,
    loadMore,
  } = useDriverReviews(token, driver?._id ?? null);

  if (loading && reviews.length === 0) {
    return (
      <View className="flex-1 bg-white">
        <ScreenHeader title={t('reviews.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.secondary} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ScreenHeader title={t('reviews.title')} />

      <FlatList
        data={reviews}
        keyExtractor={review => review._id}
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
        ListHeaderComponent={
          <SummaryCard summary={summary} fallbackName={driver?.name} />
        }
        renderItem={({ item }) => <ReviewCard review={item} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View className="py-6">
              <ActivityIndicator color={colors.secondary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState />
          )
        }
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** The average and the count, straight from the response's driver block. */
function SummaryCard({
  summary,
  fallbackName,
}: {
  summary: DriverReviewSummary | null;
  fallbackName?: string;
}) {
  const { t } = useTranslation();

  const average = summary?.averageRating;
  const total = summary?.totalReviews ?? 0;

  return (
    <View
      className="mb-5 flex-row items-center rounded-2xl border border-border bg-white p-5"
      style={CARD_SHADOW}
    >
      <View className="items-center">
        <Text className="text-[40px] font-extrabold leading-[44px] text-secondary">
          {typeof average === 'number' ? average.toFixed(1) : '—'}
        </Text>
        <Stars rating={average ?? 0} size={15} />
      </View>

      <View className="ml-5 flex-1">
        <Text
          className="text-[15px] font-bold text-secondary"
          numberOfLines={1}
        >
          {summary?.name?.trim() || fallbackName?.trim() || t('reviews.title')}
        </Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted">
          {total > 0
            ? t('reviews.totalCount', { count: total })
            : t('reviews.emptyBody')}
        </Text>
      </View>
    </View>
  );
}

/**
 * One review, with the rider left unnamed. A driver reading their ratings has
 * no use for who left which one, and putting a name on a low score invites
 * exactly the kind of matching-up we don't want — so the name and the initial
 * taken from it both stay off, and every card reads the same.
 */
function ReviewCard({ review }: { review: DriverReview }) {
  const when = rideMoment(review.createdAt);
  const comment = review.comment?.trim();

  const { t } = useTranslation();

  return (
    <View
      className="mb-3 rounded-2xl border border-border bg-white p-4"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center">
        <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-surface">
          <MaterialIcons name="person" size={20} color={colors.muted} />
        </View>

        <View className="ml-3 flex-1">
          <Text
            className="text-[14px] font-bold text-secondary"
            numberOfLines={1}
          >
            {t('reviews.anonymous')}
          </Text>
          {when ? (
            <Text className="mt-0.5 text-[11px] font-semibold text-muted">
              {when}
            </Text>
          ) : null}
        </View>

        <Stars rating={review.rating} size={14} />
      </View>

      {/* Plenty of riders rate without writing anything — the stars alone are
          a complete review, so nothing stands in for a missing comment. */}
      {comment ? (
        <Text className="mt-3 text-[13px] leading-5 text-secondary">
          {comment}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Five stars, halves included: 4.3 has to read as "between 4 and 5" or the
 * number above it looks wrong.
 */
function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map(position => {
        const icon =
          rating >= position
            ? 'star'
            : rating >= position - 0.5
              ? 'star-half'
              : 'star-border';
        return (
          <MaterialIcons
            key={position}
            name={icon}
            size={size}
            color={icon === 'star-border' ? colors.indicatorBorder : '#f5a623'}
          />
        );
      })}
    </View>
  );
}

function EmptyState() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center px-6 py-16">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surface }}
      >
        <MaterialIcons
          name="star-outline"
          size={34}
          color={colors.indicatorBorder}
        />
      </View>

      <Text className="mt-5 text-base font-bold text-secondary">
        {t('reviews.emptyTitle')}
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        {t('reviews.emptyBody')}
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
        {t('reviews.errorTitle')}
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
