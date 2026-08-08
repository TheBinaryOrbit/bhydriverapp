/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundPushHandler } from './src/services/pushService';
import { startRideDispatch } from './src/services/rideDispatch';
import { dutyTask } from './src/services/dutyTask';

// Before `registerComponent`, deliberately: a background data message spins up
// headless JS with no React tree, so this cannot live inside `App`.
registerBackgroundPushHandler();

// Same reason, and the same mistake that used to be made here — the ride
// overlay is drawn for a driver who is *not* looking at the app, so the code
// that draws it cannot live in a tab that unmounts the moment they leave. This
// runs in every JS context the app has: the one with the UI, the headless one
// `DutyService` starts for a shift, and the headless one Firebase starts for a
// push into a process that had been killed.
startRideDispatch();

// The shift itself, for the same reason and more so — `DutyService` starts this
// on a React context it created, with no activity anywhere. The key matches
// `DutyService.TASK_KEY`.
AppRegistry.registerHeadlessTask('DutyTask', () => dutyTask);

AppRegistry.registerComponent(appName, () => App);
