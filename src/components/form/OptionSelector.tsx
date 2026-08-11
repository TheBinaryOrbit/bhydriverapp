import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { colors } from '../../theme/colors';

export type Option = {
  value: string;
  label: string;
  /** Optional icon name shown before the label. */
  icon?: string;
  /** Icon family for the option icon. */
  iconSet?: 'material' | 'community';
  /**
   * Artwork to show in place of [icon] — a vehicle type ships its own picture
   * of the car, and one glyph repeated down the list tells the driver nothing
   * about which row is the hatchback. [icon] stays the fallback for a URL that
   * is missing or will not load.
   */
  iconUrl?: string;
  /** Optional second line (e.g. a vehicle type's description). */
  caption?: string;
};

type Props = {
  label: string;
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  /** One option per row instead of wrapping chips. */
  stacked?: boolean;
  /**
   * Renders the chosen option alone, greyed and unpressable — the selector
   * equivalent of `FormField`'s `locked`, for values the driver can't change.
   */
  locked?: boolean;
  /** Small grey helper line under the options (hidden while `error` is set). */
  hint?: string;
  className?: string;
};

/** Chip / row selector used for gender and vehicle type. */
export default function OptionSelector({
  label,
  options,
  value,
  onChange,
  required = false,
  error,
  stacked = false,
  locked = false,
  hint,
  className = '',
}: Props) {
  // Nothing to show the driver if a locked value doesn't match any option, so
  // fall back to the full list rather than rendering an empty row.
  const shown = locked
    ? options.filter(option => option.value === value)
    : options;

  return (
    <View className={className}>
      <Text className="mb-2 text-sm font-semibold text-secondary">
        {label}
        {required ? <Text className="text-[#d92d20]"> *</Text> : null}
      </Text>

      <View className={stacked ? 'gap-2' : 'flex-row flex-wrap gap-2'}>
        {(shown.length > 0 ? shown : options).map(option => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={locked}
              className={`flex-row items-center rounded-xl px-4 py-3 ${
                locked ? '' : 'active:opacity-80'
              } ${stacked ? 'w-full' : ''}`}
              // The screens these sit on are white, so an unselected chip needs
              // a tinted fill of its own — a white chip with a #e0e0e0 hairline
              // reads as no chip at all.
              style={{
                borderWidth: selected && !locked ? 2 : 1,
                borderColor: locked
                  ? colors.border
                  : selected
                    ? colors.secondary
                    : colors.indicatorBorder,
                backgroundColor:
                  selected && !locked ? '#eaf2f8' : colors.surface,
              }}
            >
              <OptionIcon
                option={option}
                tint={locked || !selected ? colors.muted : colors.secondary}
                dimmed={locked}
              />

              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text
                  className={`text-sm ${locked ? 'text-muted' : 'text-secondary'} ${
                    selected && !locked ? 'font-bold' : 'font-medium'
                  }`}
                >
                  {option.label}
                </Text>
                {option.caption ? (
                  <Text className="mt-0.5 text-xs text-muted">
                    {option.caption}
                  </Text>
                ) : null}
              </View>

              {locked ? (
                <MaterialIcons
                  name="lock-outline"
                  size={16}
                  color={colors.muted}
                  style={{ marginLeft: stacked ? 'auto' : 6, flexShrink: 0 }}
                />
              ) : selected ? (
                <MaterialIcons
                  name="check-circle"
                  size={18}
                  color={colors.tertiary}
                  style={{ marginLeft: stacked ? 'auto' : 6, flexShrink: 0 }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text className="mt-1 text-xs font-medium text-[#d92d20]">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

/** The artwork on a row: the option's own image, or its glyph. */
function OptionIcon({
  option,
  tint,
  dimmed,
}: {
  option: Option;
  tint: string;
  dimmed: boolean;
}) {
  // A broken URL is the case worth handling: these come off the server, and a
  // row that renders as a blank gap is worse than the glyph the list used to
  // show. Reset when the URL changes so a re-render can't strand a good image
  // behind a failure that belonged to a different one.
  const [failed, setFailed] = useState<string | null>(null);
  const url = option.iconUrl?.trim();

  if (url && failed !== url) {
    return (
      <Image
        source={{ uri: url }}
        // Contained rather than cropped: the icons are drawings of cars on
        // transparent backgrounds, in whatever aspect ratio they were drawn.
        resizeMode="contain"
        onError={() => setFailed(url)}
        style={{
          width: ICON_IMAGE,
          height: ICON_IMAGE,
          marginRight: 10,
          flexShrink: 0,
          opacity: dimmed ? 0.5 : 1,
        }}
      />
    );
  }

  if (!option.icon) {
    return null;
  }

  const Glyph =
    option.iconSet === 'community' ? MaterialCommunityIcons : MaterialIcons;
  return (
    <Glyph
      name={option.icon}
      size={18}
      color={tint}
      style={{ marginRight: 8, flexShrink: 0 }}
    />
  );
}

/**
 * Bigger than the 18pt glyph it replaces: a photo of a car reduced to icon size
 * is a grey smudge, and telling a hatchback from an SUV is the entire reason
 * these are on the row.
 */
const ICON_IMAGE = 34;
