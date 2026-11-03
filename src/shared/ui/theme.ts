import { useColorScheme } from 'react-native';

const light = {
  background: '#ffffff',
  surface: '#f2f3f5',
  text: '#111418',
  textMuted: '#5b6470',
  primary: '#c2410c',
  onPrimary: '#ffffff',
  made: '#1b7a3a',
  missed: '#b3261e',
  onStatus: '#ffffff',
  border: '#d9dce1',
  // The outline of a text field: dark enough to see, 3:1 against the page and against the field.
  fieldBorder: '#7a828e',
};

const dark: typeof light = {
  background: '#101215',
  surface: '#1b1e23',
  text: '#f2f3f5',
  textMuted: '#a3abb7',
  primary: '#ff8a3d',
  onPrimary: '#101215',
  made: '#2fa354',
  missed: '#e0584f',
  // Dark text: white on the brighter dark-mode status colours is only 3.2:1 to 3.7:1.
  onStatus: '#101215',
  border: '#2d3138',
  fieldBorder: '#69727e',
};

export type Theme = typeof light;

/** Both palettes by name: `useTheme` picks one, and a test checks their contrast. */
export const themes = { light, dark };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
