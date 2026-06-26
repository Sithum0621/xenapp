export function formatGamesScheduleDurationLabel(
  minutes: number | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (minutes == null || minutes <= 0) {
    return t('parentDashboard.gamesScheduleExamStartDurationFallback');
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return t('parentDashboard.gamesScheduleTimeLimitHoursMinutes', { hours, minutes: mins });
  }
  if (hours > 0) return t('parentDashboard.gamesScheduleTimeLimitHours', { hours });
  return t('parentDashboard.gamesScheduleTimeLimitMinutes', { minutes: mins });
}
