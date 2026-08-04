import React from 'react';
import { Pressable, Text, View, type DimensionValue } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';
import { earliestExpiry } from '../../utils/validators';

type Props = {
  label: string;
  /** The month as a plain number, `'1'`–`'12'`, or `''` when unset. */
  month: string;
  /** The four-digit year, or `''` when unset. */
  year: string;
  onChangeMonth: (value: string) => void;
  onChangeYear: (value: string) => void;
  /** How many years beyond the earliest one to offer. */
  yearsAhead?: number;
  hint?: string;
  error?: string;
  className?: string;
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Month-and-year picker for an expiry date, chosen from chips rather than
 * typed. Months read as names but are stored as numbers, which is what the
 * backend takes.
 *
 * Only dates from next month on are offered — an expiry already behind the
 * driver isn't a thing they can mean to enter. Year comes first because it
 * decides which months are live: in the earliest year the months already gone
 * are dead, and every month is live in any later one.
 */
export default function ExpiryPicker({
  label,
  month,
  year,
  onChangeMonth,
  onChangeYear,
  yearsAhead = 5,
  hint,
  error,
  className = '',
}: Props) {
  const { t } = useTranslation();

  const first = earliestExpiry();
  const selectedYear = Number(year);

  const years: number[] = [];
  for (let i = 0; i <= yearsAhead; i += 1) {
    years.push(first.year + i);
  }
  // An imported policy can run further out than the list goes. Keeping its year
  // on the end means the driver sees what they have instead of a blank row.
  if (selectedYear > years[years.length - 1]) {
    years.push(selectedYear);
  }

  // With no year picked yet the earliest one sets the rule, so the months
  // already gone this year read as unavailable from the start.
  const activeYear = selectedYear || first.year;
  const isLive = (value: number) =>
    activeYear > first.year || value >= first.month;

  const pickYear = (value: number) => {
    if (String(value) === year) {
      onChangeYear('');
      return;
    }
    onChangeYear(String(value));
    // Moving back to the earliest year can strand a month that was only valid
    // in a later one — drop it rather than leave an expiry that's already past.
    if (month && value === first.year && Number(month) < first.month) {
      onChangeMonth('');
    }
  };

  const pickMonth = (value: number) => {
    if (String(value) === month) {
      onChangeMonth('');
      return;
    }
    onChangeMonth(String(value));
    // A live month with no year can only mean the earliest year, so filling it
    // in saves a tap. Anything later is an explicit choice the driver makes.
    if (!year) {
      onChangeYear(String(first.year));
    }
  };

  return (
    <View className={className}>
      <Text className="text-sm font-bold text-secondary">{label}</Text>

      <Text className="mb-2 mt-3 text-xs font-semibold text-muted">
        {t('onboarding.vehicle.insuranceYear')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {years.map(value => (
          <Chip
            key={value}
            label={String(value)}
            selected={String(value) === year}
            onPress={() => pickYear(value)}
          />
        ))}
      </View>

      <Text className="mb-2 mt-4 text-xs font-semibold text-muted">
        {t('onboarding.vehicle.insuranceMonth')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MONTHS.map(value => (
          <Chip
            key={value}
            label={t(`common.monthsShort.${value}`)}
            selected={String(value) === month}
            disabled={!isLive(value)}
            onPress={() => pickMonth(value)}
            // Four to a row, so the grid reads as a calendar rather than a
            // ragged wrap of names of different lengths.
            width="23%"
          />
        ))}
      </View>

      {error ? (
        <Text className="mt-2 text-xs font-medium text-[#d92d20]">{error}</Text>
      ) : hint ? (
        <Text className="mt-2 text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  width?: DimensionValue;
};

/** One selectable value, styled to match `OptionSelector`'s chips. */
function Chip({
  label,
  selected,
  disabled = false,
  onPress,
  width,
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-xl px-4 py-2.5 ${
        disabled ? '' : 'active:opacity-80'
      }`}
      style={{
        width,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.secondary : colors.indicatorBorder,
        backgroundColor: selected ? '#eaf2f8' : colors.surface,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        className={`text-sm ${selected ? 'font-bold' : 'font-medium'} ${
          disabled ? 'text-muted' : 'text-secondary'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
