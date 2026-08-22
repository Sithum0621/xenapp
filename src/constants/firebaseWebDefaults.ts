/**
 * Firebase web client config derived from repo `google-services.json`.
 * These are public client keys (same as Android) — safe to ship in the app bundle.
 */
export const FIREBASE_WEB_DEFAULTS = {
  apiKey: 'AIzaSyAB0f4aRXEYx0zbt6DtsB-GOHdTCTKLhKU',
  authDomain: 'xenv0001.firebaseapp.com',
  projectId: 'xenv0001',
  storageBucket: 'xenv0001.firebasestorage.app',
  messagingSenderId: '840326303130',
  /** Filled at runtime from Supabase edge `firebase-web-config` when not in env. */
  appId: '',
  vapidKey: '',
} as const;

export type FirebaseWebRuntimeConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};
