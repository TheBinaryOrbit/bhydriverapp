import React, { useCallback } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';
import { pickImage } from '../../utils/imagePicker';
import type { PickedImage } from '../../types/driver';

type Props = {
  label: string;
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  /** `avatar` = circular profile photo, `card` = wide document/vehicle tile. */
  variant?: 'avatar' | 'card';
  /** Already-uploaded image URL, shown until the driver picks a replacement. */
  currentUrl?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  className?: string;
};

/** Tap-to-upload tile backed by the camera / photo library. */
export default function ImageUpload({
  label,
  value,
  onChange,
  variant = 'card',
  currentUrl,
  hint,
  required = false,
  error,
  className = '',
}: Props) {
  const { t } = useTranslation();

  // A freshly picked file wins; otherwise fall back to what the server has.
  const previewUri = value?.uri ?? currentUrl;

  const handlePick = useCallback(async () => {
    const image = await pickImage({
      title: t('upload.sheetTitle'),
      camera: t('upload.camera'),
      gallery: t('upload.gallery'),
      cancel: t('common.cancel'),
      invalidType: t('upload.invalidType'),
      tooLarge: t('upload.tooLarge'),
      failed: t('upload.failed'),
    });
    if (image) {
      onChange(image);
    }
  }, [onChange, t]);

  const borderColor = error
    ? '#d92d20'
    : previewUri
      ? colors.secondary
      : colors.border;

  if (variant === 'avatar') {
    return (
      <View className={`items-center ${className}`}>
        <Pressable onPress={handlePick} className="active:opacity-80">
          <View
            className="h-28 w-28 items-center justify-center overflow-hidden rounded-full"
            style={{
              borderWidth: 2,
              borderColor,
              borderStyle: previewUri ? 'solid' : 'dashed',
              backgroundColor: colors.surface,
            }}
          >
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                className="h-full w-full"
                resizeMode="cover"
              />
            ) : (
              <MaterialIcons
                name="add-a-photo"
                size={28}
                color={colors.muted}
              />
            )}
          </View>

          <View
            className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full"
            style={{
              backgroundColor: colors.tertiary,
              borderWidth: 2,
              borderColor: colors.primary,
            }}
          >
            <MaterialIcons name="edit" size={15} color={colors.primary} />
          </View>
        </Pressable>

        <Text className="mt-2 text-sm font-semibold text-secondary">
          {label}
          {required ? <Text className="text-[#d92d20]"> *</Text> : null}
        </Text>
        {error ? (
          <Text className="mt-0.5 text-xs font-medium text-[#d92d20]">
            {error}
          </Text>
        ) : hint ? (
          <Text className="mt-0.5 text-xs text-muted">{hint}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className={className}>
      <Text className="mb-1.5 text-sm font-semibold text-secondary">
        {label}
        {required ? <Text className="text-[#d92d20]"> *</Text> : null}
      </Text>

      <Pressable onPress={handlePick} className="active:opacity-80">
        <View
          className="h-36 items-center justify-center overflow-hidden rounded-xl"
          style={{
            borderWidth: previewUri ? 1 : 1.5,
            borderColor,
            borderStyle: previewUri ? 'solid' : 'dashed',
            backgroundColor: colors.surface,
          }}
        >
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <>
              <MaterialIcons
                name="cloud-upload"
                size={26}
                color={colors.muted}
              />
              <Text className="mt-1.5 text-xs font-medium text-muted">
                {t('upload.tapToUpload')}
              </Text>
            </>
          )}
        </View>
      </Pressable>

      {value ? (
        <View className="mt-1.5 flex-row items-center justify-between">
          <Text
            className="flex-1 text-xs text-muted"
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {value.name}
          </Text>
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text className="ml-3 text-xs font-semibold text-tertiary">
              {t('upload.remove')}
            </Text>
          </Pressable>
        </View>
      ) : error ? (
        <Text className="mt-1 text-xs font-medium text-[#d92d20]">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
