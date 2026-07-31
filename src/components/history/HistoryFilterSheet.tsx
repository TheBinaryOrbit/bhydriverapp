import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import PrimaryButton from '../PrimaryButton';
import { colors } from '../../theme/colors';
import type { RideStatus } from '../../types/quickRide';
import { DATE_PRESETS, type DatePresetKey } from '../../utils/dateFilters';

/**
 * The statuses worth filtering by. `searching` and `assigned` describe a ride
 * that hasn't finished, so they never meaningfully land in history.
 */
export const FILTERABLE_STATUSES: RideStatus[] = [
  'completed',
  'cancelled',
  'expired',
];

const STATUS_ICON: Record<string, string> = {
  completed: 'check-circle',
  cancelled: 'cancel',
  expired: 'timer-off',
};

export type HistoryFilterValue = {
  preset: DatePresetKey;
  /** Empty means every status — the API is asked for no `status` at all. */
  statuses: RideStatus[];
};

type Props = {
  visible: boolean;
  value: HistoryFilterValue;
  onApply: (next: HistoryFilterValue) => void;
  onClose: () => void;
};

/**
 * Status and date filters for the ride history.
 *
 * Edits are held as a draft and only committed on Apply, so tapping through the
 * options doesn't fire a request per tap.
 */
export default function HistoryFilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<HistoryFilterValue>(value);

  // Discard an abandoned draft: whatever is live is what the sheet reopens on.
  useEffect(() => {
    if (visible) {
      setDraft(value);
    }
  }, [value, visible]);

  const toggleStatus = (status: RideStatus) =>
    setDraft(previous => ({
      ...previous,
      statuses: previous.statuses.includes(status)
        ? previous.statuses.filter(entry => entry !== status)
        : [...previous.statuses, status],
    }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        {/* Swallows taps so the sheet itself doesn't dismiss. */}
        <Pressable
          className="rounded-t-3xl bg-white px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
          onPress={() => {}}
        >
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />

          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-secondary">
              {t('history.filter.title')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              className="active:opacity-60"
            >
              <MaterialIcons name="close" size={22} color={colors.secondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            // Long enough for every option on a small screen, capped so the
            // Apply button is never pushed off the bottom.
            style={{ maxHeight: 420 }}
          >
            <SectionLabel text={t('history.filter.statusLabel')} />

            <View className="flex-row flex-wrap">
              {FILTERABLE_STATUSES.map(status => {
                const on = draft.statuses.includes(status);
                return (
                  <Pressable
                    key={status}
                    onPress={() => toggleStatus(status)}
                    className="mr-2 mt-2 flex-row items-center rounded-full border px-3.5 py-2.5 active:opacity-70"
                    style={{
                      borderColor: on ? colors.tertiary : colors.border,
                    }}
                  >
                    <MaterialIcons
                      name={on ? 'check' : STATUS_ICON[status]}
                      size={15}
                      color={on ? colors.tertiary : colors.muted}
                    />
                    <Text
                      className="ml-1.5 text-xs font-bold"
                      style={{ color: on ? colors.tertiary : colors.muted }}
                    >
                      {t(`history.status.${status}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mt-2.5 text-[11px] leading-4 text-muted">
              {t('history.filter.statusHint')}
            </Text>

            <SectionLabel text={t('history.filter.dateLabel')} />

            <View className="overflow-hidden rounded-2xl border border-border">
              {DATE_PRESETS.map((preset, index) => {
                const on = draft.preset === preset;
                return (
                  <Pressable
                    key={preset}
                    onPress={() => setDraft(previous => ({ ...previous, preset }))}
                    className={`flex-row items-center px-4 py-3.5 active:bg-surface ${
                      index > 0 ? 'border-t border-border' : ''
                    }`}
                  >
                    <MaterialIcons
                      name={on ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={19}
                      color={on ? colors.tertiary : colors.indicatorBorder}
                    />
                    <Text
                      className={`ml-3 text-sm ${on ? 'font-bold' : 'font-semibold'}`}
                      style={{ color: on ? colors.secondary : colors.muted }}
                    >
                      {t(`history.filter.presets.${preset}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View className="mt-5 flex-row items-center">
            <Pressable
              onPress={() => setDraft({ preset: 'all', statuses: [] })}
              className="mr-3 rounded-2xl border border-border px-5 py-4 active:bg-surface"
            >
              <Text className="text-sm font-bold text-muted">
                {t('history.filter.reset')}
              </Text>
            </Pressable>

            <PrimaryButton
              className="flex-1"
              label={t('history.filter.apply')}
              icon="check"
              onPress={() => onApply(draft)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wide text-muted">
      {text}
    </Text>
  );
}
