import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { colors } from '../theme/colors';

type Props = {
  title: string;
  /** Optional right-hand slot (e.g. an "Add" action). */
  right?: React.ReactNode;
  onBack?: () => void;
};

/** Back arrow + title bar shared by the profile sub-screens. */
export default function ScreenHeader({ title, right, onBack }: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center border-b border-border bg-white px-5 pb-3"
      style={{ paddingTop: insets.top + 8 }}
    >
      <Pressable
        onPress={onBack ?? navigation.goBack}
        hitSlop={10}
        className="active:opacity-60"
      >
        <MaterialIcons name="arrow-back" size={24} color={colors.secondary} />
      </Pressable>
      <Text className="ml-3 flex-1 text-lg font-bold text-secondary">
        {title}
      </Text>
      {right}
    </View>
  );
}
