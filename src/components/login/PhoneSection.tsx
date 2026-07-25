import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import PhoneField from './PhoneField';
import TermsAgreement from './TermsAgreement';

type Props = {
  phone: string;
  onChangePhone: (text: string) => void;
  agreed: boolean;
  onToggleAgreed: () => void;
  onPressPrivacy?: () => void;
  onPressTerms?: () => void;
};

/** Phone-entry step of the login flow. Matches `_buildPhoneInputSection`. */
export default function PhoneSection({
  phone,
  onChangePhone,
  agreed,
  onToggleAgreed,
  onPressPrivacy,
  onPressTerms,
}: Props) {
  const { t } = useTranslation();

  return (
    <View className="w-full">
      <Text className="text-lg font-bold text-secondary">
        {t('login.phoneTitle')}
      </Text>
      <Text className="mt-2 text-[13px] font-medium leading-5 text-muted">
        {t('login.phoneSubtitle')}
      </Text>

      <View className="mt-10">
        <PhoneField value={phone} onChangeText={onChangePhone} />
      </View>

      <View className="mt-6">
        <TermsAgreement
          checked={agreed}
          onToggle={onToggleAgreed}
          onPressPrivacy={onPressPrivacy}
          onPressTerms={onPressTerms}
        />
      </View>
    </View>
  );
}
