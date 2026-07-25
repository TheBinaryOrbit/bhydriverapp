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
 * Screen container that keeps inputs and footer buttons above the keyboard.
 *
 * iOS gets `padding` (the window never resizes there). Android relies on the
 * manifest's `windowSoftInputMode="adjustResize"`, so no behavior is needed —
 * switch it to `height` if `edgeToEdgeEnabled` is ever turned on, because the
 * window stops resizing in that mode.
 *
 * Every screen with a text input should use this, and pair it with a
 * `ScrollView` using `keyboardShouldPersistTaps="handled"` +
 * `keyboardDismissMode="on-drag"` so taps on buttons register on the first
 * press and dragging dismisses the keyboard.
 */
export default function KeyboardSafeView({
  children,
  className = 'flex-1 bg-white',
  offset = 0,
}: Props) {
  return (
    <KeyboardAvoidingView
      className={className}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
