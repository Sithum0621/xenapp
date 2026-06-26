import { useEffect, useState } from 'react';

import { remainingSecondsUntilDeadline } from '@/src/utils/gamesScheduleExamTimer';

export function useExamCountdown(
  deadlineAt: string | null | undefined,
  enabled: boolean,
  onExpire?: () => void,
): number {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    enabled ? remainingSecondsUntilDeadline(deadlineAt) : 0,
  );

  useEffect(() => {
    if (!enabled || !deadlineAt) {
      setRemainingSeconds(0);
      return;
    }

    const tick = () => {
      const next = remainingSecondsUntilDeadline(deadlineAt);
      setRemainingSeconds(next);
      if (next <= 0) onExpire?.();
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineAt, enabled, onExpire]);

  return remainingSeconds;
}
