import type { ReadingAttempt, ReadingConfiguration, ReadingLog } from './readingTypes';

export interface CalendarDay {
  date: string;
  total: number;
  measure: string | null;
  color: string | null;
  logs: ReadingLog[];
  starts: ReadingAttempt[];
  finishes: ReadingAttempt[];
}

export function buildCalendarDays(
  year: number,
  month: number,
  logs: ReadingLog[],
  attempts: ReadingAttempt[],
  configurations: ReadingConfiguration[],
): CalendarDay[] {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthLogs = logs.filter((log) => log.date.startsWith(`${monthKey}-`));
  const monthAttempts = attempts.filter((attempt) =>
    attempt.startedOn.startsWith(`${monthKey}-`) || attempt.finishedOn?.startsWith(`${monthKey}-`),
  );

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
    const dayLogs = monthLogs.filter((log) => log.date === date);
    const dayAttempts = monthAttempts.filter((attempt) => attempt.startedOn === date || attempt.finishedOn === date);
    const total = dayLogs.reduce((sum, log) => sum + log.amount, 0);
    const configuration = dayLogs.length > 0
      ? configurations.find((entry) => entry.id === dayLogs.at(-1)?.configurationId)
      : undefined;
    const category = configuration?.categories.find((entry) =>
      total >= entry.minimum && (entry.maximum === null || total <= entry.maximum),
    );

    return {
      date,
      total,
      measure: dayLogs.length > 0 ? dayLogs.at(-1)?.measure ?? null : null,
      color: category?.color ?? null,
      logs: dayLogs,
      starts: dayAttempts.filter((attempt) => attempt.startedOn === date),
      finishes: dayAttempts.filter((attempt) => attempt.finishedOn === date),
    };
  });
}

export function annualFinishedStats(attempts: ReadingAttempt[], year: number) {
  const finishedAttempts = attempts
    .filter((attempt) => attempt.finishedOn !== null)
    .slice()
    .sort((left, right) =>
      (left.finishedOn ?? '').localeCompare(right.finishedOn ?? '') ||
      left.startedOn.localeCompare(right.startedOn) ||
      left.id.localeCompare(right.id),
    );
  const seenBooks = new Set<string>();
  const rereadAttemptIds = new Set<string>();
  for (const attempt of finishedAttempts) {
    if (seenBooks.has(attempt.bookId)) rereadAttemptIds.add(attempt.id);
    else seenBooks.add(attempt.bookId);
  }
  const finishedThisYear = finishedAttempts.filter((attempt) => attempt.finishedOn?.startsWith(`${year}-`));
  return {
    attempts: finishedThisYear.length,
    uniqueBooks: new Set(finishedThisYear.map((attempt) => attempt.bookId)).size,
    rereads: finishedThisYear.filter((attempt) => rereadAttemptIds.has(attempt.id)).length,
  };
}

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
