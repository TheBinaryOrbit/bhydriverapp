import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Driver } from '../types/driver';

/**
 * Persists the session returned by `/auth/verify` and `/drivers/onboard`.
 * For production-grade secret storage consider swapping AsyncStorage for an
 * encrypted store later.
 */
const KEYS = {
  token: '@bhy/token',
  userId: '@bhy/userId',
  phone: '@bhy/phone',
  userType: '@bhy/userType',
  driver: '@bhy/driver',
  upiId: '@bhy/upiId',
} as const;

export async function saveSession(params: {
  token: string;
  phone: string;
  driver?: Driver;
}): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(KEYS.token, params.token),
    AsyncStorage.setItem(KEYS.phone, params.phone),
    AsyncStorage.setItem(KEYS.userType, 'driver'),
    params.driver?._id
      ? AsyncStorage.setItem(KEYS.userId, params.driver._id)
      : Promise.resolve(),
    params.driver
      ? AsyncStorage.setItem(KEYS.driver, JSON.stringify(params.driver))
      : Promise.resolve(),
  ]);
}

/** Refreshes just the cached driver after a `GET`/`PATCH /drivers/me`. */
export async function cacheDriver(driver: Driver): Promise<void> {
  await AsyncStorage.setItem(KEYS.driver, JSON.stringify(driver));
}

export async function savePhone(phone: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.phone, phone);
}

/**
 * The driver's UPI id, cached so the home screen doesn't call
 * `/payment-details/me` on every launch to ask a question whose answer only
 * changes when the driver themselves changes it.
 *
 * It lives with the session on purpose: `clearSession` wipes every key in here,
 * so signing out can't leave one driver's payout id sitting on a shared phone.
 */
export async function cacheUpiId(upiId: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.upiId, upiId);
}

export async function getCachedUpiId(): Promise<string | null> {
  const cached = await AsyncStorage.getItem(KEYS.upiId);
  // An empty string is "no id", not a cache hit — see `useUpiId`.
  return cached?.trim() ? cached : null;
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.token);
}

export async function getUserId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.userId);
}

export async function getDriver(): Promise<Driver | null> {
  const raw = await AsyncStorage.getItem(KEYS.driver);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Driver;
  } catch {
    return null;
  }
}

/** Call on `401` — clears credentials so the driver is sent back to Login. */
export async function clearSession(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map(key => AsyncStorage.removeItem(key)),
  );
}
