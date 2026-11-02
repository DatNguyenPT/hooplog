// Puts a `localStorage` on the app (backed by the local SQLite file) for Supabase to keep the
// sign-in in, as Expo's own Supabase guide does. It is not encrypted; see ADR 0008.
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

let client: SupabaseClient | null | undefined;

/**
 * The Supabase client, or null when this build has no project URL and publishable key (copy
 * `.env.example` to `.env.local`). The core app never needs it: it is only for the optional account.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  // Read with plain dot access: Expo swaps these for their values when the app is bundled.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    client = null;
    return client;
  }

  const created = createClient(url, publishableKey, {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no browser address bar to read a sign-in link from.
      detectSessionInUrl: false,
    },
  });

  // Refreshing the sign-in in the background only makes sense while the app is on screen.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void created.auth.startAutoRefresh();
    else void created.auth.stopAutoRefresh();
  });

  client = created;
  return client;
}
