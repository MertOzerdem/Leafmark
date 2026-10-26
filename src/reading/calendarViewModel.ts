import type { ReadingAttempt, ReadingConfiguration, ReadingLog, ReadingMeasure } from './readingTypes';

export interface CalendarDay {
  date: string;
  total: number;
  measure: string | null;
  color: string | null;
  totals: CalendarDayTotal[];
  logs: ReadingLog[];
  starts: ReadingAttempt[];
  finishes: ReadingAttempt[];
}

export interface CalendarDayTotal {
  configurationId: string;
  total: number;
  measure: ReadingMeasure;
  color: string | null;
}

export function aggregateCalendarTotalsByDate(
  logs: ReadingLog[],
  configurations: ReadingConfiguration[],
): Map<string, CalendarDayTotal[]> {
  const grouped = new Map<string, Map<string, { configurationId: string; total: number; measure: ReadingMeasure }>>();
  for (const log of logs) {
    const day = grouped.get(log.date) ?? new Map();
    const key = `${log.configurationId}:${log.measure}`;
    const current = day.get(key);
    day.set(key, {
      configurationId: log.configurationId,
      total: (current?.total ?? 0) + log.amount,
      measure: log.measure,
    });
    grouped.set(log.date, day);
  }

  const configurationOrder = new Map(configurations.map((configuration, index) => [configuration.id, index]));
  return new Map([...grouped.entries()].map(([date, day]) => {
    const totals = [...day.values()]
      .sort((left, right) => (configurationOrder.get(left.configurationId) ?? -1) - (configurationOrder.get(right.configurationId) ?? -1))
      .map((entry): CalendarDayTotal => {
        const configuration = configurations.find((candidate) => candidate.id === entry.configurationId);
        const category = configuration?.categories.find((candidate) =>
          entry.total >= candidate.minimum && (candidate.maximum === null || entry.total <= candidate.maximum),
        );
        return {
          configurationId: entry.configurationId,
          total: entry.total,
          measure: entry.measure,
          color: category?.color ?? null,
        };
      });
    return [date, totals];
  }));
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
  const monthTotals = aggregateCalendarTotalsByDate(monthLogs, configurations);

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
    const dayLogs = monthLogs.filter((log) => log.date === date);
    const dayAttempts = monthAttempts.filter((attempt) => attempt.startedOn === date || attempt.finishedOn === date);
    const totals = monthTotals.get(date) ?? [];
    const latestTotal = totals.at(-1);

    return {
      date,
      total: latestTotal?.total ?? 0,
      measure: latestTotal?.measure ?? null,
      color: latestTotal?.color ?? null,
      totals,
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
