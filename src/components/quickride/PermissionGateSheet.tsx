import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

import PrimaryButton from '../PrimaryButton';
import {
  DRIVER_PERMISSIONS,
  backgroundLocationNeedsSettings,
  canGoOnline,
  readDriverPermissions,
  requestDriverPermission,
  type DriverPermission,
  type DriverPermissionStatus,
} from '../../services/driverPermissions';
import { colors } from '../../theme/colors';

/**
 * The four grants, asked for at the one moment they make sense.
 *
 * This sits between the duty switch and `driver:online`. Everything on it is
 * something the driver loses rides without, and none of it is obvious from the
 * system dialogs alone — "display over other apps" in particular reads like
 * spyware until you say it's how a ride request reaches you while you're in
 * Maps. So each row explains itself in the driver's terms and asks on its own,
 * rather than firing four system prompts in a row at a driver who has no idea
 * what any of them are for.
 *
 * Nothing here is trusted to a callback. Two of the three are settings screens
 * with no reliable result, so the state is re-read from the platform every time
 * the app comes back to the foreground — which is exactly when the driver has
 * returned from granting something.
 */

type Props = {
  visible: boolean;
  /** Dismiss without going online. */
  onClose: () => void;
  /** Everything required is granted — carry on with `driver:online`. */
  onContinue: () => void;
};

/** Icon per row. The rest of the copy is i18n, keyed by the same name. */
const ICONS: Record<DriverPermission, string> = {
  backgroundLocation: 'my-location',
  notifications: 'notifications-active',
  overlay: 'layers',
  battery: 'battery-charging-full',
};

export default function PermissionGateSheet({
  visible,
  onClose,
  onContinue,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  /**
   * `null` until the first read comes back. The rows show their copy straight
   * away and resolve their tick a moment later, which is better than either
   * half of the alternative: assuming granted flashes a live "go online"
   * button, and assuming denied flashes an "Allow" on grants the driver
   * already gave us.
   */
  const [status, setStatus] = useState<DriverPermissionStatus | null>(null);
  const [asking, setAsking] = useState<DriverPermission | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await readDriverPermissions());
  }, []);

  /**
   * Re-read on open, and again on every return to the foreground.
   *
   * The second half is what actually makes the sheet correct: the overlay and
   * battery screens report nothing useful back, some ROMs return from them
   * before the driver has touched anything, and from Android 11 background
   * location is granted in the Settings app entirely. In all three cases the
   * only honest signal is the app becoming active again.
   */
  useEffect(() => {
    if (!visible) {
      return;
    }
    refresh();

    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        setAsking(null);
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh, visible]);

  const request = useCallback(
    async (permission: DriverPermission) => {
      setAsking(permission);
      try {
        await requestDriverPermission(permission);
        // The request may have resolved on a stale read (see above), so the
        // returned value is ignored in favour of re-reading the platform.
        await refresh();
      } finally {
        setAsking(null);
      }
    },
    [refresh],
  );

  const ready = status !== null && canGoOnline(status);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        {/* Swallows taps so the sheet itself doesn't dismiss. */}
        <Pressable
          className="rounded-t-3xl bg-white px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
          onPress={() => {}}
        >
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />

          <View className="flex-row items-start justify-between">
            <Text className="flex-1 pr-3 text-lg font-extrabold text-secondary">
              {t('permissions.title')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('permissions.notNow')}
              className="active:opacity-60"
            >
              <MaterialIcons name="close" size={22} color={colors.secondary} />
            </Pressable>
          </View>

          <Text className="mt-1.5 text-xs leading-5 text-muted">
            {t('permissions.subtitle')}
          </Text>

          <View className="gap-3 py-5">
            {DRIVER_PERMISSIONS.map(permission => (
              <PermissionRow
                key={permission}
                permission={permission}
                granted={status?.[permission] ?? null}
                busy={asking === permission}
                // One at a time — the second settings screen would land on top
                // of the first and lose the driver.
                disabled={asking !== null && asking !== permission}
                onAllow={() => request(permission)}
              />
            ))}
          </View>

          <PrimaryButton
            label={t('permissions.goOnline')}
            icon="bolt"
            disabled={!ready}
            onPress={onContinue}
          />

          {!ready ? (
            <Text className="mt-3 text-center text-xs leading-4 text-muted">
              {t('permissions.blockedHint')}
            </Text>
          ) : null}

          <Pressable
            onPress={onClose}
            className="mt-3 items-center py-2 active:opacity-60"
          >
            <Text className="text-sm font-bold text-muted">
              {t('permissions.notNow')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ------------------------------------------------ one grant */

function PermissionRow({
  permission,
  granted,
  busy,
  disabled,
  onAllow,
}: {
  permission: DriverPermission;
  /** `null` while the first read is still in flight. */
  granted: boolean | null;
  busy: boolean;
  disabled: boolean;
  onAllow: () => void;
}) {
  const { t } = useTranslation();

  // "Allow" that throws the driver out into the Settings app is a small lie —
  // from Android 11 that is the only route to background location, so say so.
  const viaSettings =
    permission === 'backgroundLocation' && backgroundLocationNeedsSettings();

  return (
    <View
      className="flex-row items-center rounded-2xl border p-3.5"
      style={{
        borderColor: granted ? colors.successSurface : colors.border,
        backgroundColor: granted ? colors.successSurface : colors.primary,
      }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: granted ? colors.primary : colors.surface }}
      >
        <MaterialIcons
          name={ICONS[permission]}
          size={20}
          color={granted ? colors.success : colors.secondary}
        />
      </View>

      <View className="ml-3 flex-1">
        <Text className="text-[13px] font-bold text-secondary">
          {t(`permissions.${permission}.title`)}
        </Text>
        <Text className="mt-0.5 text-xs leading-4 text-muted">
          {t(`permissions.${permission}.body`)}
        </Text>
      </View>

      {granted === null ? (
        <ActivityIndicator size="small" color={colors.indicatorBorder} />
      ) : granted ? (
        <MaterialIcons
          name="check-circle"
          size={22}
          color={colors.success}
          // The tick *is* the status; without this it reads as a button.
          accessibilityLabel={t('permissions.granted')}
        />
      ) : (
        <Pressable
          onPress={onAllow}
          disabled={disabled || busy}
          hitSlop={6}
          accessibilityRole="button"
          className="ml-2 min-w-[74px] items-center rounded-xl px-3 py-2 active:opacity-85"
          style={{
            backgroundColor: colors.secondary,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text className="text-xs font-bold text-white">
              {viaSettings ? t('permissions.openSettings') : t('permissions.allow')}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}
