import { Platform } from 'react-native';

/** Pixels of movement before a touch is treated as scroll (not tap). */
const TOUCH_SLOP_PX = 10;

let touchActive = false;
let touchScrollGesture = false;
let touchStartX = 0;
let touchStartY = 0;
let installed = false;

const PASSIVE_CAPTURE: AddEventListenerOptions = { passive: true, capture: true };

function onTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) {
    touchActive = false;
    return;
  }
  touchActive = true;
  touchScrollGesture = false;
  touchStartX = event.touches[0]!.clientX;
  touchStartY = event.touches[0]!.clientY;
}

function onTouchMove(event: TouchEvent) {
  if (!touchActive || event.touches.length !== 1) return;
  const dx = event.touches[0]!.clientX - touchStartX;
  const dy = event.touches[0]!.clientY - touchStartY;
  if (Math.abs(dy) >= TOUCH_SLOP_PX && Math.abs(dy) >= Math.abs(dx)) {
    touchScrollGesture = true;
  } else if (Math.abs(dx) >= TOUCH_SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
    touchScrollGesture = true;
  }
}

function onTouchEnd() {
  touchActive = false;
}

/**
 * Passive document-level touch listeners (web only).
 * Never calls preventDefault — scroll remains native and responsive.
 * Tracks scroll-vs-tap so press handlers can ignore accidental activations.
 */
export function installWebScrollTouchBootstrap(): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || installed) {
    return () => {};
  }
  installed = true;

  document.addEventListener('touchstart', onTouchStart, PASSIVE_CAPTURE);
  document.addEventListener('touchmove', onTouchMove, PASSIVE_CAPTURE);
  document.addEventListener('touchend', onTouchEnd, PASSIVE_CAPTURE);
  document.addEventListener('touchcancel', onTouchEnd, PASSIVE_CAPTURE);

  return () => {
    document.removeEventListener('touchstart', onTouchStart, PASSIVE_CAPTURE);
    document.removeEventListener('touchmove', onTouchMove, PASSIVE_CAPTURE);
    document.removeEventListener('touchend', onTouchEnd, PASSIVE_CAPTURE);
    document.removeEventListener('touchcancel', onTouchEnd, PASSIVE_CAPTURE);
    installed = false;
  };
}

/**
 * Returns true when the latest touch ended as a scroll/pan — suppress button onPress.
 * Resets the flag after read so the next tap works normally.
 */
export function shouldSuppressScrollConflictPress(): boolean {
  if (Platform.OS !== 'web') return false;
  if (!touchScrollGesture) return false;
  touchScrollGesture = false;
  return true;
}

/** Wrap any onPress so scroll gestures never trigger navigation/actions on web. */
export function scrollSafePressHandler<T extends (...args: never[]) => void>(
  handler: T | undefined | null,
): T | undefined {
  if (!handler) return undefined;
  const wrapped = ((...args: Parameters<T>) => {
    if (shouldSuppressScrollConflictPress()) return;
    blurWebActiveElement();
    handler(...args);
  }) as T;
  return wrapped;
}

/**
 * Drop keyboard/pointer focus before React Navigation hides the previous screen
 * with aria-hidden (avoids "descendant retained focus" console errors on web).
 */
export function blurWebActiveElement(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = document.activeElement;
  if (el instanceof HTMLElement && el !== document.body && typeof el.blur === 'function') {
    el.blur();
  }
}
