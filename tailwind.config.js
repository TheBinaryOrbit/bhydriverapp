/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Keep in sync with src/theme/colors.ts — that file is the source of
      // truth for the plain values (gradients, StatusBar, navigation options).
      colors: {
        primary: "#ffffff",
        secondary: "#002d4b",
        secondaryLight: "#004a7c",
        tertiary: "#ff6b05",

        muted: "#6f6f70",
        border: "#e0e0e0",
        surface: "#f8f9fa",
        indicatorBorder: "#cbd2d9",

        success: "#12805c",
        warning: "#b54708",
        danger: "#d92d20",
      },
    },
  },
  plugins: [],
}
