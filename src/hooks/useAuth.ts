import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { ApiError } from '../services/api';
import { fetchMe } from '../services/driverService';
import {
  cacheDriver,
  clearSession,
  getDriver,
  getToken,
} from '../storage/authStorage';
import type { Driver } from '../types/driver';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Clears credentials and sends the driver back to Login. */
export function useSignOut(): () => Promise<void> {
  const navigation = useNavigation();

  return useCallback(async () => {
    await clearSession();
    const root = navigation.getParent<Nav>() ?? (navigation as unknown as Nav);
    root.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, [navigation]);
}

export type AuthState = {
  token: string | null;
  driver: Driver | null;
  /** True only while the first load is in flight — a refresh keeps the old data. */
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Swap in a driver returned by a write, without a round-trip. */
  setDriver: (driver: Driver) => void;
};

/**
 * The signed-in driver. Renders the cached profile immediately, then refreshes
 * it from `GET /drivers/me`. A `401` means the token died server-side, so the
 * session is cleared and the driver is bounced to Login.
 */
export function useAuth(): AuthState {
  const signOut = useSignOut();

  const [token, setToken] = useState<string | null>(null);
  const [driver, setDriverState] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const stored = await getToken();
    setToken(stored);

    if (!stored) {
      setDriverState(null);
      setLoading(false);
      return;
    }

    const cached = await getDriver();
    if (cached) {
      setDriverState(cached);
      setLoading(false);
    }

    try {
      const fresh = await fetchMe(stored);
      setDriverState(fresh);
      await cacheDriver(fresh);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  // Fires on mount and again on every focus, so edits made on the sub-screens
  // are picked up when the driver comes back.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const setDriver = useCallback((next: Driver) => {
    setDriverState(next);
    cacheDriver(next);
  }, []);

  return { token, driver, loading, error, reload, setDriver };
}
