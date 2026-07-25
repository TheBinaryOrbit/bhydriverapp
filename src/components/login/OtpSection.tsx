import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';

type Props = {
  otp: string;
  onChangeOtp: (text: string) => void;
  /** Called automatically once 6 digits are entered. */
  onComplete: () => void;
  phone: string;
  resendTimer: number;
  onResend: () => void;
};

/** OTP-entry step of the login flow. Matches `_buildOtpInputSection`. */
export default function OtpSection({
  otp,
  onChangeOtp,
  onComplete,
  phone,
  resendTimer,
  onResend,
}: Props) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  const maskedPhone = maskPhone(phone);

  const handleChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    onChangeOtp(digits);
  };

  return (
    <View className="w-full">
      <Text className="text-xl font-bold text-secondary">{t('otp.title')}</Text>
      <Text className="mt-2 text-sm font-medium leading-5 text-muted">
        {t('otp.sentTo', { phone: maskedPhone })}
      </Text>

      {/* OTP input */}
      <View
        className="mt-10 h-14 justify-center rounded-xl border px-4"
        style={{
          borderColor: focused ? colors.secondary : colors.border,
          borderWidth: focused ? 2 : 1,
          backgroundColor: focused ? colors.surface : colors.primary,
        }}
      >
        <TextInput
          value={otp}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          placeholder={t('otp.placeholder')}
          placeholderTextColor="#9e9e9e"
          style={{
            fontSize: 18,
            fontWeight: '600',
            color: colors.secondary,
            letterSpacing: 4,
          }}
        />
      </View>

      {/* Resend row */}
      <View className="mt-8 flex-row items-center justify-center">
        <Text className="text-sm text-muted">{t('otp.didntReceive')} </Text>
        {resendTimer > 0 ? (
          <Text className="text-sm font-medium text-[#9e9e9e]">
            {t('otp.resendIn', { seconds: resendTimer })}
          </Text>
        ) : (
          <Pressable onPress={onResend} hitSlop={8}>
            <Text className="text-sm font-semibold text-secondary underline">
              {t('otp.resend')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Auto-verify info box */}
      <View
        className="mt-4 flex-row items-center rounded-lg px-4 py-3"
        style={{ backgroundColor: '#e8f4fd', borderWidth: 1, borderColor: '#b3d9f2' }}
      >
        <MaterialIcons
          name="info-outline"
          size={16}
          color="rgba(0, 45, 75, 0.7)"
        />
        <Text
          className="ml-2 flex-1 text-xs"
          style={{ color: 'rgba(0, 45, 75, 0.8)' }}
        >
          {t('otp.autoVerify')}
        </Text>
      </View>
    </View>
  );
}

function maskPhone(phone: string): string {
  if (!phone) {
    return 'xxxxxxxx';
  }
  const head = phone.slice(0, Math.min(4, phone.length));
  const tail = phone.length > 4 ? phone.slice(-2) : '';
  return `${head}****${tail}`;
}
