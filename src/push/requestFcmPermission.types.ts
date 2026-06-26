export type FcmPermissionResult =
  | { granted: true }
  | { granted: false; reason: 'denied' | 'unsupported' | 'error'; message?: string };
