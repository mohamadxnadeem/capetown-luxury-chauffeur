// Brand colors and theme objects derived from www.capetown-concierge.co.za.
// All hex values come from the site's styled-components CSS — keep this file as
// the single source of truth so screens never hard-code colors.

import { MD3LightTheme } from "react-native-paper";
import {
  DefaultTheme as NavDefaultTheme,
  Theme as NavTheme,
} from "@react-navigation/native";

export const colors = {
  primary: "#0b5b33", // deep emerald — primary buttons, header, active states
  primaryDark: "#063e23", // gradient endpoint, hover
  primaryDeepest: "#0a1a10", // footer-level near-black green
  primaryContainer: "#0e6e3e", // slightly lighter emerald for tonal surfaces
  surface: "#ffffff",
  surfaceMuted: "#eef3f0", // very faint emerald wash for inactive surfaces
  background: "#f6f8f7", // off-white page background
  text: "#1f2a24", // body text
  heading: "#123d2b", // section headings / titles
  muted: "#6c7a74", // secondary copy
  border: "#e3e8e5",
  whatsapp: "#25d366",
  onPrimary: "#ffffff",
  // Calendar "booked" / unavailable day cell. Soft coral so it reads as
  // "taken, can't use" without screaming danger.
  bookedBg: "#fbe3e3",
  bookedText: "#b03b3b",
  // Partially-booked day — has bookings but free time left. Amber wash,
  // still selectable.
  partialBg: "#fdf1d8",
  partialText: "#8a6411",
} as const;

// Signature hero gradient used on the site's header + sticky CTA.
export const gradientPrimary: [string, string] = [colors.primary, colors.primaryDark];

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 12,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    primaryContainer: colors.primaryContainer,
    onPrimaryContainer: colors.onPrimary,
    secondary: colors.primary,
    onSecondary: colors.onPrimary,
    secondaryContainer: colors.surfaceMuted,
    onSecondaryContainer: colors.heading,
    background: colors.background,
    onBackground: colors.text,
    surface: colors.surface,
    onSurface: colors.text,
    surfaceVariant: colors.surfaceMuted,
    onSurfaceVariant: colors.muted,
    outline: colors.border,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: colors.surface,
      level2: colors.surface,
      level3: colors.surface,
    },
  },
} as const;

// React Navigation theme — keeps the tab bar / stack card white so the
// emerald header reads as deliberate punctuation, not a wash.
export const navTheme: NavTheme = {
  ...NavDefaultTheme,
  colors: {
    ...NavDefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

// react-native-calendars styling — matches selected-day + dots to the brand.
export const calendarTheme = {
  backgroundColor: colors.surface,
  calendarBackground: colors.surface,
  textSectionTitleColor: colors.muted,
  selectedDayBackgroundColor: colors.primary,
  selectedDayTextColor: colors.onPrimary,
  todayTextColor: colors.primary,
  dayTextColor: colors.text,
  textDisabledColor: "#c8d2ce",
  dotColor: colors.primary,
  selectedDotColor: colors.onPrimary,
  arrowColor: colors.primary,
  monthTextColor: colors.heading,
  textMonthFontWeight: "700" as const,
  textDayHeaderFontWeight: "600" as const,
};
