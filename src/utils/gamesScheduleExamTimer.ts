/** Format seconds as H:MM:SS or MM:SS for exam countdown display. */
export function formatExamCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Remaining seconds until an ISO deadline (server-synchronised). */
export function remainingSecondsUntilDeadline(deadlineIso: string | null | undefined): number {
  if (!deadlineIso) return 0;
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
}
