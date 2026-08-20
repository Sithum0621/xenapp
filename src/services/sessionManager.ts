const SESSION_TTL_MS = 10 * 60 * 1000;

let expiresAtMs: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleWithRemaining(onExpire: () => void) {
  clearTimer();
  if (expiresAtMs == null) return;

  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) {
    onExpire();
    return;
  }

  timer = setTimeout(onExpire, remainingMs);
}

export function startSessionCountdown(onExpire: () => void) {
  expiresAtMs = Date.now() + SESSION_TTL_MS;
  scheduleWithRemaining(onExpire);
}

/** Extend the idle window (e.g. when the app returns to foreground within grace). */
export function refreshSessionCountdown(onExpire: () => void) {
  if (expiresAtMs == null) return;
  expiresAtMs = Date.now() + SESSION_TTL_MS;
  scheduleWithRemaining(onExpire);
}

export function hasSessionExpired() {
  return expiresAtMs != null && Date.now() >= expiresAtMs;
}

export function clearSessionCountdown() {
  clearTimer();
  expiresAtMs = null;
}
