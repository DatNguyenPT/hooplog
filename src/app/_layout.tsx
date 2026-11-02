import { Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, Platform } from 'react-native';

import '@/shared/i18n';
import { DatabaseProvider } from '@/shared/db/DatabaseProvider';
import { EdgeSwipeBack } from '@/shared/ui/EdgeSwipeBack';
import { useTheme } from '@/shared/ui/theme';

export default function RootLayout() {
  const theme = useTheme();

  // The window itself keeps a default light colour. It shows through while one screen slides over
  // another, which is the flash seen when going back, so it is painted like the screens.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => undefined);
  }, [theme.background]);

  return (
    <Suspense fallback={<ActivityIndicator accessibilityLabel="Loading" />}>
      <DatabaseProvider>
        {/* iOS already swipes back from the left edge natively; Android has no such gesture here. */}
        <EdgeSwipeBack enabled={Platform.OS === 'android'}>
          {/* A slim top bar with just the back arrow, so leaving a screen never needs a scroll. */}
          <Stack
            screenOptions={{
              headerTitle: '',
              headerShadowVisible: false,
              headerStyle: { backgroundColor: theme.background },
              headerTintColor: theme.text,
              // Behind every screen: navigation's own default is a light grey, even in dark mode.
              contentStyle: { backgroundColor: theme.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            {/* Live sessions keep their full height for the buttons and leave through Done. */}
            <Stack.Screen name="shooting/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="workout/[id]" options={{ headerShown: false }} />
          </Stack>
        </EdgeSwipeBack>
      </DatabaseProvider>
    </Suspense>
  );
}
