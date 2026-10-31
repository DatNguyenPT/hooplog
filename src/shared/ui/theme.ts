import { useColorScheme } from 'react-native';

const light = {
  background: '#ffffff',
  surface: '#f2f3f5',
  text: '#111418',
  textMuted: '#5b6470',
  primary: '#e8590c',
  onPrimary: '#ffffff',
  made: '#1b7a3a',
  missed: '#b3261e',
  onStatus: '#ffffff',
  border: '#d9dce1',
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
  onStatus: '#ffffff',
  border: '#2d3138',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
