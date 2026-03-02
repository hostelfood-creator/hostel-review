/**
 * Haptic feedback utility using the Vibration API.
 * Falls back silently on devices/browsers that don't support it.
 * Adds a native-app feel to key user actions.
 */

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // Silently ignore — some browsers block vibrate in certain contexts
  }
}

/** Successful action — double pulse (e.g. QR check-in, review submitted) */
export function hapticSuccess(): void {
  vibrate([50, 30, 50])
}

/** Light tap — single short pulse (e.g. button press, nav tap) */
export function hapticTap(): void {
  vibrate([40])
}

/** Very light feedback — subtle pulse (e.g. slider snap, tag toggle) */
export function hapticLight(): void {
  vibrate([10])
}

/** Error feedback — long single pulse (e.g. validation error, failed action) */
export function hapticError(): void {
  vibrate([200])
}
