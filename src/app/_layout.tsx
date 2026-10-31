import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { ActivityIndicator } from 'react-native';

import '@/shared/i18n';
import { DatabaseProvider } from '@/shared/db/DatabaseProvider';

export default function RootLayout() {
  return (
    <Suspense fallback={<ActivityIndicator accessibilityLabel="Loading" />}>
      <DatabaseProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </DatabaseProvider>
    </Suspense>
  );
}
