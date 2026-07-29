import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../theme/colors';

type Props = {
  value: string;
  onChange: (digits: string) => void;
  length?: number;
  /** Fires as soon as the last box fills — the rider just read it out. */
  onComplete?: (digits: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/**
 * Boxed digit entry for the ride-start OTP.
 *
 * One offscreen `TextInput` backs every box, which is what keeps paste, the
 * number pad and SMS autofill working — per-box inputs break all three.
 */
export default function OtpBoxes({
  value,
  onChange,
  length = 4,
  onComplete,
  disabled = false,
  invalid = false,
}: Props) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) {
      onComplete?.(digits);
    }
  };

  return (
    <Pressable
      onPress={() => !disabled && input.current?.focus()}
      className="flex-row justify-center"
    >
      {Array.from({ length }).map((_, index) => {
        const digit = value[index];
        // The caret sits on the first empty box, or the last one when full.
        const active =
          focused && !disabled && index === Math.min(value.length, length - 1);

        return (
          <View
            key={index}
            className="mx-1.5 h-16 w-14 items-center justify-center rounded-2xl border"
            style={{
              borderColor: invalid
                ? colors.danger
                : active
                  ? colors.secondary
                  : colors.border,
              borderWidth: active || invalid ? 2 : 1,
              backgroundColor: disabled ? colors.surface : colors.primary,
            }}
          >
            <Text className="text-2xl font-extrabold text-secondary">
              {digit ?? ''}
            </Text>
          </View>
        );
      })}

      <TextInput
        ref={input}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={length}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Off-screen rather than `display: none`, which would kill the keyboard. */
  hidden: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
});
