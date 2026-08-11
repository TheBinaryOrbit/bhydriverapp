/**
 * BHY App
 *
 * @format
 */
import 'react-native-gesture-handler';
import './global.css';
import './src/i18n';

import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationProvider,
  TaskRemovedBehavior,
} from '@googlemaps/react-native-navigation-sdk';

import RootNavigator from './src/navigation/RootNavigator';
import { reportInstallReferrer } from './src/services/installReferrer';
import { initMetaSdk } from './src/services/metaEvents';
import { registerForegroundPushHandler } from './src/services/pushService';

// Before the first render, not in an effect: the SDK auto-logs the app-open
// event, and an app-open reported a frame late is one reported after the driver
// could already have left. It runs in the UI context only — the headless ones
// this app starts for a shift or a push are not the app being opened.
initMetaSdk();

function App() {
  // Android hands a foreground push to JS and draws nothing itself, so without
  // a subscriber the message arrives and is discarded unobserved.
  useEffect(registerForegroundPushHandler, []);

  // Once per install, and a no-op on every launch after it succeeds. Deliberately
  // unawaited: nothing on screen depends on it, and Play can take its time
  // answering.
  useEffect(() => {
    reportInstallReferrer();
  }, []);

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
