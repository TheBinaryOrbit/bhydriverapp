import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  checkForUpdate,
  currentAppSettings,
  fetchAppSettings,
  trimmed,
  type AppSettings,
  type UpdateCheck,
} from '../services/appSettings';

/**
 * The home screen's half of `GET /settings/:type` — the update gate and the
 * admin's home notice.
 *
 * Read on mount and again on every foreground, because that is the only way
 * either of them ever changes: nothing about settings is pushed, so an app that
 * asks once at launch would run all day on a build number raised an hour ago.
 *
 * The two are not shown the same way. The update is a prompt, because a build
 * the server has disowned is worth interrupting a driver for. The notice is not
 * — it fills the QuickRide tab's offline panel (see `HomeNoticeCard`), so it has
 * nothing to dismiss and no once-per-launch rule to enforce: a driver who is
 * offline can read it, and one who is working never sees it.
 */

export type AppSettingsState = {
  settings: AppSettings | null;
  update: UpdateCheck;
  /** The update prompt is up. Mandatory ones cannot be closed. */
  updateVisible: boolean;
  /** The notice's HTML, or `null` when the admin has posted nothing. */
  notice: string | null;
  dismissUpdate: () => void;
};

export function useAppSettings(): AppSettingsState {
  const [settings, setSettings] = useState<AppSettings | null>(
    currentAppSettings,
  );
  /**
   * Dismissal is per-session, and has no effect at all on a mandatory update:
   * `updateVisible` below keeps that one up whatever this says, so a stray
   * back-press or a tap through a backdrop cannot open the app up.
   */
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchAppSettings();
    if (next) {
      setSettings(next);
    }
  }, []);

  useEffect(() => {
    load();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        load();
      }
    });
    return () => subscription.remove();
  }, [load]);

  // Memoised because the check reaches into the native module for this build's
  // `versionCode`, and the home screen re-renders on every tab switch.
  const update = useMemo(() => checkForUpdate(settings), [settings]);
  const notice = trimmed(settings?.homePageContent);

  const updateVisible = update.available && (update.mandatory || !updateDismissed);

  return {
    settings,
    update,
    updateVisible,
    notice,
    dismissUpdate: useCallback(() => {
      setUpdateDismissed(true);
    }, []),
  };
}
