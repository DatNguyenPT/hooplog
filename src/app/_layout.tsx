import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { ActivityIndicator, Platform } from 'react-native';

import '@/shared/i18n';
import { DatabaseProvider } from '@/shared/db/DatabaseProvider';
import { EdgeSwipeBack } from '@/shared/ui/EdgeSwipeBack';
import { useTheme } from '@/shared/ui/theme';

export default function RootLayout() {
  const theme = useTheme();

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
