/**
 * BHY App
 *
 * @format
 */
import 'react-native-gesture-handler';
import './global.css';
import './src/i18n';

import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationProvider,
  TaskRemovedBehavior,
} from '@googlemaps/react-native-navigation-sdk';

import RootNavigator from './src/navigation/RootNavigator';

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#002d4b" />
        {/* Wraps the whole app because the Navigation SDK session is a
            singleton: the terms dialog is shown once per install, and guidance
            has to survive the driver leaving the navigation screen.
            `CONTINUE_SERVICE` keeps it running if they swipe the app away
            mid-trip — a driver on the road must not lose directions. */}
        <NavigationProvider
          termsAndConditionsDialogOptions={{
            title: 'Navigation terms',
            companyName: 'BHY',
            showOnlyDisclaimer: true,
          }}
          taskRemovedBehavior={TaskRemovedBehavior.CONTINUE_SERVICE}
        >
          <RootNavigator />
        </NavigationProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
