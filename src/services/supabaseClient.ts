import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * AsyncStorage touches `window` and crashes Expo web SSR / static render.
 * Native: AsyncStorage. Web client: localStorage. Web SSR: no-op (session restores in browser).
 */
function createAuthStorage(): Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
> {
  if (Platform.OS !== 'web') {
    return AsyncStorage;
  }

  return {
    getItem: async (key) => {
      if (typeof window === 'undefined') return null;
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode / quota */
      }
    },
    removeItem: async (key) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createAuthStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
