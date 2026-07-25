import { Alert, Platform, ToastAndroid } from 'react-native';

/** Shows a short, transient message (Toast on Android, Alert on iOS). */
export function notify(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('', message);
  }
}
