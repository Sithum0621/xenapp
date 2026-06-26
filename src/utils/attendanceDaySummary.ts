import type { AttendanceOccurrence } from '@/src/services/studentAttendanceApi';

export type AttendanceDaySummary = {
  date: string;
  present: number;
  absent: number;
  total: number;
  occurrences: AttendanceOccurrence[];
};

export type DayBorderStatus = 'neutral' | 'all_present' | 'all_absent' | 'mixed';

export function buildDaySummaryMap(
  occurrences: AttendanceOccurrence[],
): Map<string, AttendanceDaySummary> {
  const map = new Map<string, AttendanceDaySummary>();
  for (const occ of occurrences) {
    const existing = map.get(occ.date);
    if (existing) {
      existing.occurrences.push(occ);
      if (occ.present) existing.present += 1;
      else existing.absent += 1;
      existing.total += 1;
    } else {
      map.set(occ.date, {
        date: occ.date,
        present: occ.present ? 1 : 0,
        absent: occ.present ? 0 : 1,
        total: 1,
        occurrences: [occ],
      });
    }
  }
  for (const summary of map.values()) {
    summary.occurrences.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return map;
}

export function dayBorderStatus(summary: AttendanceDaySummary | undefined): DayBorderStatus {
  if (!summary || summary.total === 0) return 'neutral';
  if (summary.present === summary.total) return 'all_present';
  if (summary.absent === summary.total) return 'all_absent';
  return 'mixed';
}

/** Present share 0..1 for split ring (present segments first from top, clockwise). */
export function presentShare(summary: AttendanceDaySummary): number {
  if (summary.total <= 0) return 0;
  return summary.present / summary.total;
}
