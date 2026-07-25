import React from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../theme/colors';

type Props = {
  checked: boolean;
  onToggle: () => void;
  onPressPrivacy?: () => void;
  onPressTerms?: () => void;
};

/**
 * Terms & Privacy consent row with a checkbox and inline links.
 * Matches the example's `_buildTermsAgreement`.
 */
export default function TermsAgreement({
  checked,
  onToggle,
  onPressPrivacy,
  onPressTerms,
}: Props) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-start">
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        className="mt-0.5 h-6 w-6 items-center justify-center rounded-md border-[1.5px]"
        style={{
          borderColor: checked ? colors.secondary : colors.indicatorBorder,
          backgroundColor: checked ? colors.secondary : 'transparent',
        }}
      >
        {checked ? (
          <MaterialIcons name="check" size={16} color={colors.primary} />
        ) : null}
      </Pressable>

      <Text className="ml-2.5 flex-1 text-[13px] font-medium leading-5 text-muted">
        {t('login.termsPrefix')}{' '}
        <Text
          className="font-bold text-secondary underline"
          onPress={onPressPrivacy}
        >
          {t('login.privacyPolicy')}
        </Text>{' '}
        {t('login.and')}{' '}
        <Text
          className="font-bold text-secondary underline"
          onPress={onPressTerms}
        >
          {t('login.termsAndConditions')}
        </Text>
      </Text>
    </View>
  );
}
