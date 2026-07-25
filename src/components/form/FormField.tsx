import React, { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '../../theme/colors';

type Props = TextInputProps & {
  label: string;
  /** Shows the red asterisk and is used by the screens' validation copy. */
  required?: boolean;
  /** Inline validation message rendered under the field. */
  error?: string;
  /** Small grey helper line under the field (hidden while `error` is set). */
  hint?: string;
  /** Non-editable fields (e.g. the verified phone number) are greyed out. */
  locked?: boolean;
  className?: string;
};

/** Labelled text input matching the auth screens' rounded outline style. */
export default function FormField({
  label,
  required = false,
  error,
  hint,
  locked = false,
  className = '',
  ...inputProps
}: Props) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? '#d92d20'
    : focused
      ? colors.secondary
      : colors.border;

  return (
    <View className={className}>
      <Text className="mb-1.5 text-sm font-semibold text-secondary">
        {label}
        {required ? <Text className="text-[#d92d20]"> *</Text> : null}
      </Text>

      <TextInput
        {...inputProps}
        editable={!locked && inputProps.editable !== false}
        onFocus={e => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        placeholderTextColor="#9e9e9e"
        style={[
          {
            borderColor,
            borderWidth: focused && !error ? 2 : 1,
            backgroundColor: locked ? colors.surface : colors.primary,
            color: locked ? colors.muted : colors.secondary,
          },
          inputProps.style,
        ]}
        className="rounded-xl px-4 py-3.5 text-base"
      />

      {error ? (
        <Text className="mt-1 text-xs font-medium text-[#d92d20]">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
