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
import MyReviewsScreen from '../screens/profile/MyReviewsScreen';
import SubscriptionScreen from '../screens/profile/SubscriptionScreen';
import KycScreen from '../screens/profile/KycScreen';
import ContentPageScreen from '../screens/profile/ContentPageScreen';
import RideDetailsScreen from '../screens/quickride/RideDetailsScreen';
import RideSuccessScreen from '../screens/quickride/RideSuccessScreen';
import NavigationScreen from '../screens/quickride/NavigationScreen';
import OutstationDetailsScreen from '../screens/outstation/OutstationDetailsScreen';

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
        <Stack.Screen name="MyReviews" component={MyReviewsScreen} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} />
        <Stack.Screen name="Kyc" component={KycScreen} />
        <Stack.Screen name="ContentPage" component={ContentPageScreen} />

        {/* QuickRide — the live ride, pushed over the tabs. Success replaces
            details, so a back swipe can't reach a ride that is already over. */}
        <Stack.Screen name="RideDetails" component={RideDetailsScreen} />
        {/* Outstation shares the success screen — a finished trip pays out the
            same way, through the same UPI QR. */}
        <Stack.Screen
          name="OutstationDetails"
          component={OutstationDetailsScreen}
        />
        <Stack.Screen
          name="RideSuccess"
          component={RideSuccessScreen}
          options={{ gestureEnabled: false }}
        />
        {/* Full-screen guidance. The back gesture is off so a stray swipe on a
            mounted phone can't kill the driver's directions. */}
        <Stack.Screen
          name="Navigate"
          component={NavigationScreen}
          options={{ gestureEnabled: false, animation: 'fade' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
