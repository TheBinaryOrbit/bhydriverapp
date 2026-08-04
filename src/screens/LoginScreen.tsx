import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import KeyboardSafeView from '../components/KeyboardSafeView';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PrimaryButton from '../components/PrimaryButton';
import PhoneSection from '../components/login/PhoneSection';
import OtpSection from '../components/login/OtpSection';
import { sendOtp, verifyOtp } from '../services/authService';
import { getFcmToken } from '../services/pushService';
import { savePhone, saveSession } from '../storage/authStorage';
import { notify } from '../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const RESEND_SECONDS = 30;

export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const sessionId = useRef('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendTimer = useCallback(() => {
    setResendTimer(RESEND_SECONDS);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleSendOtp = useCallback(async () => {
    Keyboard.dismiss();
    if (phone.length < 10) {
      notify(t('login.invalidPhone'));
      return;
    }
    // if (!agreed) {
    //   notify(t('login.agreeToTerms'));
    //   return;
    // }

    setLoading(true);
    try {
      const result = await sendOtp(phone);
      sessionId.current = result.sessionId;
      setIsOtpSent(true);
      startResendTimer();
      notify(t('login.otpSent'));
    } catch {
      notify(t('login.sendFailed'));
    } finally {
      setLoading(false);
    }
  }, [phone, agreed, t, startResendTimer]);

  const handleVerifyOtp = useCallback(async () => {
    // Keyboard.dismiss();
    if (otp.length < 6) {
      notify(t('otp.incompleteOtp'));
      return;
    }

    setLoading(true);
    try {
      await savePhone(phone);
      // `/auth/verify` is the only call that stores the push token, so this is
      // where it gets refreshed. Best-effort: `undefined` is simply left out of
      // the body, and the backend keeps the token it already had.
      const fcmToken = await getFcmToken();
      const result = await verifyOtp({
        phoneNumber: phone,
        sessionId: sessionId.current,
        otp,
        fcmToken,
      });

      if (result.userStatus === 200 && result.token) {
        // Existing driver — straight to Home.
        await saveSession({
          token: result.token,
          phone,
          driver: result.driver,
        });
        navigation.replace('Main');
      } else if (result.userStatus === 404) {
        // OTP was correct, the driver just isn't registered yet — KYC comes
        // first and is what creates the account, so registration follows it.
        navigation.replace('Kyc', { phone });
      } else {
        notify(t('otp.verifyFailed'));
      }
    } catch (error) {
      notify(
        error instanceof Error && error.message
          ? error.message
          : t('login.networkError'),
      );
    } finally {
      setLoading(false);
    }
  }, [otp, phone, navigation, t]);

  return (
    <KeyboardSafeView>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="flex-row justify-end">
          <LanguageSwitcher />
        </View>

        <View className="mt-10">
          {!isOtpSent ? (
            <PhoneSection
              phone={phone}
              onChangePhone={setPhone}
              agreed={agreed}
              onPressTerms={() => navigation.navigate('ContentPage' , { slug: 'terms-and-conditions' ,title: 'Terms and Conditions' })}
              onPressPrivacy={() => navigation.navigate('ContentPage' , { slug: 'privacy-policy' ,title: 'Privacy Policy' })}
              onToggleAgreed={() => setAgreed(prev => !prev)}
            />
          ) : (
            <OtpSection
              otp={otp}
              onChangeOtp={setOtp}
              onComplete={handleVerifyOtp}
              phone={phone}
              resendTimer={resendTimer}
              onResend={handleSendOtp}
            />
          )}
        </View>

        <View className="flex-1" />

        <PrimaryButton
          label={isOtpSent ? t('otp.verify') : t('login.sendCode')}
          icon={isOtpSent ? 'verified' : 'send'}
          onPress={isOtpSent ? handleVerifyOtp : handleSendOtp}
          loading={loading}
          className="mb-10"
        />
      </ScrollView>
    </KeyboardSafeView>
  );
}
