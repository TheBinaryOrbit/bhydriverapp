import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A stable id for this installation of the app.
 *
 * Deliberately **not** in `authStorage`: every key in there is wiped by
 * `clearSession`, and this one has to outlive a sign-out. It identifies the
 * install, not the driver — it is what ties the referrer we posted before any
 * account existed to the account that is created later, and a driver who signs
 * out and back in is still the same install.
 *
 * Generated here rather than read off the device. Android's hardware ids are
 * either unavailable, privacy-restricted, or shared between apps, and none of
 * that buys anything: the only thing this has to do is be the same string on
 * two calls from one phone. A reinstall gets a new one, which is correct — that
 * is a new install, from whatever referrer brought it.
 */
const KEY = '@bhy/deviceId';

/** Read once per launch; `getDeviceId` is called from two unrelated places. */
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) {
    return cached;
  }

  const stored = await AsyncStorage.getItem(KEY);
  if (stored) {
    cached = stored;
    return stored;
  }

  const created = randomId();
  await AsyncStorage.setItem(KEY, created);
  cached = created;
  return created;
}

/**
 * 32 hex characters from `Math.random`, which is not a cryptographic source and
 * does not need to be: this is a dedupe key on marketing data that nothing
 * authenticates with. Collisions are what matter, and 128 bits of it is far
 * more than enough for that.
 */
function randomId(): string {
  let out = '';
  while (out.length < 32) {
    out += Math.random().toString(16).slice(2);
  }
  return out.slice(0, 32);
}
