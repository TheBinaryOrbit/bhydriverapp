/**
 * Brand color palette.
 * Also mirrored in tailwind.config.js as `primary` / `secondary` / `tertiary`
 * for NativeWind className usage. Use these constants where plain values are
 * required (e.g. React Navigation options, StatusBar, gradients).
 */
export const colors = {
  primary: '#ffffff', // white
  secondary: '#002d4b', // deep navy
  secondaryLight: '#004a7c', // gradient end for navy
  tertiary: '#ff6b05', // orange accent

  // Helpful neutrals derived for UI states
  muted: '#6f6f70',
  border: '#e0e0e0',
  surface: '#f8f9fa', // selected card / badge background
  indicatorBorder: '#cbd2d9',
  secondaryMuted: 'rgba(0, 45, 75, 0.6)',

  // Status colors — verified / pending / invalid.
  success: '#12805c',
  successSurface: '#e7f6f0',
  warning: '#b54708',
  warningSurface: '#fff4ec',
  danger: '#d92d20',
  dangerSurface: '#fef3f2',
} as const;

/** Navy gradient used across badges and primary buttons. */
export const navyGradient: string[] = ['#002d4b', '#004a7c'];

export type AppColors = typeof colors;
