import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

type Props = {
  children: React.ReactNode;
  /** Classes for the container. Defaults to a full-height white screen. */
  className?: string;
  /**
   * Extra gap between the keyboard and the content, in points. Use it when the
   * screen sits under a navigation header the KAV can't measure.
   */
  offset?: number;
};

/**
 * Whether Android will shrink the window for us when the keyboard opens.
 *
 * `windowSoftInputMode="adjustResize"` in the manifest is what used to make this
 * component free on Android: the window got shorter, every screen re-laid out
 * above the keyboard, and the KAV had nothing left to do. That stops being true
 * the moment the app draws edge-to-edge, because `setDecorFitsSystemWindows(false)`
 * takes the window out of the system's insets bookkeeping and it no longer
 * resizes for anything, the IME included.
 *
 * Which is now the case here on new phones, whatever `edgeToEdgeEnabled=false`
 * in `android/gradle.properties` says. `targetSdkVersion` is 36 and the theme
 * does not set `windowOptOutEdgeToEdgeEnforcement`, so React Native turns
 * edge-to-edge on *at runtime* from API 35 up — see `updateEdgeToEdgeFeatureFlag`
 * in RN's `WindowUtil.kt`, which flags it on for Android 15 without the opt-out
 * and unconditionally for Android 16. Below API 35 nothing enables it and the
 * window still resizes.
 *
 * So the split is by device, not by build: `padding` from Android 15 up, where
 * the app has to move its own content; nothing below it, where padding on top of
 * a window that already shrank would push the inputs up twice.
 */
const ANDROID_RESIZES_FOR_KEYBOARD =
  Platform.OS === 'android' && Number(Platform.Version) < 35;

/** iOS never resizes; Android does only on the versions above. */
const BEHAVIOR = ANDROID_RESIZES_FOR_KEYBOARD ? undefined : 'padding';

/**
 * Screen container that keeps inputs and footer buttons above the keyboard.
 *
 * Every screen with a text input should use this — including the ones inside a
 * `Modal`, which is a separate window and gets none of the avoidance from the
 * screen behind it. Pair it with a `ScrollView` using
 * `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode="on-drag"` so
 * taps on buttons register on the first press and dragging dismisses the
 * keyboard.
 */
export default function KeyboardSafeView({
  children,
  className = 'flex-1 bg-white',
  offset = 0,
}: Props) {
  return (
    <KeyboardAvoidingView
      className={className}
      behavior={BEHAVIOR}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
