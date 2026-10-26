import { annualFinishedStats, buildCalendarDays } from './calendarViewModel';
import type { ReadingAttempt, ReadingConfiguration, ReadingLog } from './readingTypes';

const configuration: ReadingConfiguration = {
  id: 'pages',
  measure: 'pages',
  startsOn: '2027-01-01',
  categories: [{ position: 0, minimum: 1, maximum: null, color: '#889977' }],
};

const attempts: ReadingAttempt[] = [
  { id: 'first', bookId: 'book-a', bookTitle: 'A', startedOn: '2027-01-02', finishedOn: '2027-01-05', rating: 4, reflection: '', isCurrent: false },
  { id: 'second', bookId: 'book-a', bookTitle: 'A', startedOn: '2027-02-01', finishedOn: '2027-02-03', rating: 4.5, reflection: '', isCurrent: false },
  { id: 'other', bookId: 'book-b', bookTitle: 'B', startedOn: '2027-02-03', finishedOn: null, rating: null, reflection: '', isCurrent: true },
];

describe('reading calendar view model', () => {
  it('builds month days with category-colored totals and book start/finish events', () => {
    const logs: ReadingLog[] = [
      { id: 'log', attemptId: 'first', bookId: 'book-a', bookTitle: 'A', configurationId: 'pages', date: '2027-01-05', amount: 25, measure: 'pages', categoryPosition: 0 },
    ];
    const january = buildCalendarDays(2027, 1, logs, attempts, [configuration]);

    expect(january).toHaveLength(31);
    expect(january[4]).toMatchObject({ date: '2027-01-05', total: 25, measure: 'pages', color: '#889977' });
    expect(january[1].starts.map((attempt) => attempt.bookTitle)).toEqual(['A']);
    expect(january[4].finishes.map((attempt) => attempt.bookTitle)).toEqual(['A']);
  });

  it('keeps totals from different measure baselines separate on one date', () => {
    const minutesConfiguration: ReadingConfiguration = {
      id: 'minutes',
      measure: 'minutes',
      startsOn: '2027-01-05',
      categories: [{ position: 0, minimum: 1, maximum: null, color: '#456789' }],
    };
    const logs: ReadingLog[] = [
      { id: 'pages-a', attemptId: 'first', bookId: 'book-a', bookTitle: 'A', configurationId: 'pages', date: '2027-01-05', amount: 15, measure: 'pages', categoryPosition: 0 },
      { id: 'minutes-a', attemptId: 'other', bookId: 'book-b', bookTitle: 'B', configurationId: 'minutes', date: '2027-01-05', amount: 30, measure: 'minutes', categoryPosition: 0 },
      { id: 'pages-b', attemptId: 'second', bookId: 'book-a', bookTitle: 'A', configurationId: 'pages', date: '2027-01-05', amount: 10, measure: 'pages', categoryPosition: 0 },
    ];
    const day = buildCalendarDays(2027, 1, logs, attempts, [configuration, minutesConfiguration])[4];

    expect(day).toMatchObject({ total: 30, measure: 'minutes', color: '#456789' });
    expect(day.totals).toEqual([
      { configurationId: 'pages', total: 25, measure: 'pages', color: '#889977' },
      { configurationId: 'minutes', total: 30, measure: 'minutes', color: '#456789' },
    ]);
  });

  it('counts unique Books separately from repeat Reading attempts finished in the year', () => {
    expect(annualFinishedStats(attempts, 2027)).toEqual({ attempts: 2, uniqueBooks: 1, rereads: 1 });
  });

  it('counts same-day completed rereads as separate attempts', () => {
    const sameDayAttempts = attempts.map((attempt) => attempt.id === 'second'
      ? { ...attempt, startedOn: '2027-01-02', finishedOn: '2027-01-05' }
      : attempt);

    expect(annualFinishedStats(sameDayAttempts, 2027)).toEqual({ attempts: 2, uniqueBooks: 1, rereads: 1 });
  });
});
