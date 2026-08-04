import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How the driver likes their guidance, kept between rides.
 *
 * Deliberately not part of the session in `authStorage`: muting the voice is a
 * property of this phone in this car — a driver who works with the radio on
 * mutes once, not at the start of every ride, and signing out shouldn't undo
 * it.
 */
const MUTED = '@bhy/navMuted';

export async function getNavigationMuted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MUTED)) === 'true';
  } catch {
    // A preference we can't read is just the default one.
    return false;
  }
}

export async function setNavigationMuted(muted: boolean): Promise<void> {
  await AsyncStorage.setItem(MUTED, muted ? 'true' : 'false');
}
