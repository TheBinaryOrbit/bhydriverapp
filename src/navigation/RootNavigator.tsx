import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { colors } from '../theme/colors';
import SplashScreen from '../screens/SplashScreen';
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import LoginScreen from '../screens/LoginScreen';
import DriverOnboardingScreen from '../screens/onboarding/DriverOnboardingScreen';
import BottomTabs from './BottomTabs';
import EditPersonalInfoScreen from '../screens/profile/EditPersonalInfoScreen';
import EditVehicleScreen from '../screens/profile/EditVehicleScreen';
import ManagePaymentScreen from '../screens/profile/ManagePaymentScreen';
import KycScreen from '../screens/profile/KycScreen';
import ContentPageScreen from '../screens/profile/ContentPageScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.primary,
    primary: colors.tertiary,
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen
          name="DriverOnboarding"
          component={DriverOnboardingScreen}
        />
        <Stack.Screen name="Main" component={BottomTabs} />

        {/* Profile section — pushed over the tabs */}
        <Stack.Screen
          name="EditPersonalInfo"
          component={EditPersonalInfoScreen}
        />
        <Stack.Screen name="EditVehicle" component={EditVehicleScreen} />
        <Stack.Screen name="ManagePayment" component={ManagePaymentScreen} />
        <Stack.Screen name="Kyc" component={KycScreen} />
        <Stack.Screen name="ContentPage" component={ContentPageScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
