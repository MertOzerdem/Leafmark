import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ReadingAttempt,
  ReadingCategory,
  ReadingConfiguration,
  ReadBook,
  ReadingLog,
  ReadingMeasure,
  ReadingRepository,
  ReadingSnapshot,
} from '../reading/readingTypes';
import { isValidStarRating } from '../reading/readingTypes';
import { asRecord, bookColumns, mapBookRecord, nullableNumber, numberValue, stringValue } from './bookMapper';

export function createReadingRepository(client: SupabaseClient): ReadingRepository {
  return {
    async loadSnapshot(year) {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const [booksResult, configurationResult, colorResult, currentResult, attemptsResult, logResult, usedResult] = await Promise.all([
        client.from('books').select(bookColumns).order('created_at', { ascending: true }),
        client.from('reading_configurations')
          .select('id, measure, starts_on, categories, created_at')
          .order('starts_on', { ascending: true })
          .order('created_at', { ascending: true }),
        client.from('reading_category_colors').select('position, color'),
        client.from('reading_attempts')
          .select('id, book_id, started_on, finished_on, rating, reflection, is_current, book:books!inner(title)')
          .eq('is_current', true)
          .maybeSingle(),
        client.from('reading_attempts')
          .select('id, book_id, started_on, finished_on, rating, reflection, is_current, book:books!inner(title)')
          .order('started_on', { ascending: true }),
        client.from('reading_logs')
          .select('id, attempt_id, configuration_id, logged_on, amount, category_position, configuration:reading_configurations!inner(measure), attempt:reading_attempts!inner(book_id, book:books!inner(title))')
          .gte('logged_on', startDate)
          .lte('logged_on', endDate)
          .order('logged_on', { ascending: true }),
        client.from('reading_logs').select('configuration_id'),
      ]);

      throwIfError(booksResult.error);
      throwIfError(configurationResult.error);
      throwIfError(colorResult.error);
      throwIfError(currentResult.error);
      throwIfError(attemptsResult.error);
      throwIfError(logResult.error);
      throwIfError(usedResult.error);

      const colorsByPosition = new Map<number, string>();
      for (const value of arrayValue(colorResult.data)) {
        const row = asRecord(value);
        const position = numberValue(row.position);
        const color = stringValue(row.color);
        if (color) colorsByPosition.set(position, color);
      }

      const configurations = arrayValue(configurationResult.data).map((value) => mapConfiguration(value, colorsByPosition));
      const currentAttempt = currentResult.data ? mapCurrentAttempt(currentResult.data) : null;
      const attempts = arrayValue(attemptsResult.data).map(mapReadingAttempt);
      const logs = arrayValue(logResult.data).map(mapReadingLog);
      const usedConfigurationIds = [...new Set(arrayValue(usedResult.data)
        .map((value) => stringValue(asRecord(value).configuration_id))
        .filter(Boolean))];

      return {
        books: arrayValue(booksResult.data).map(mapBookRecord),
        configurations,
        currentAttempt,
        attempts,
        logs,
        usedConfigurationIds,
      };
    },

    async loadReadBooks() {
      const [booksResult, attemptsResult] = await Promise.all([
        client.from('books').select(bookColumns).order('created_at', { ascending: true }),
        client.from('reading_attempts')
          .select('id, book_id, started_on, finished_on, rating, reflection, is_current, book:books!inner(title)')
          .order('finished_on', { ascending: false, nullsFirst: false })
          .order('started_on', { ascending: false }),
      ]);
      throwIfError(booksResult.error);
      throwIfError(attemptsResult.error);

      const books = arrayValue(booksResult.data).map(mapBookRecord);
      const attemptsByBook = new Map<string, ReadingAttempt[]>();
      for (const value of arrayValue(attemptsResult.data)) {
        const attempt = mapReadingAttempt(value);
        const attempts = attemptsByBook.get(attempt.bookId) ?? [];
        attempts.push(attempt);
        attemptsByBook.set(attempt.bookId, attempts);
      }

      return books.flatMap((book): ReadBook[] => {
        const attempts = attemptsByBook.get(book.id) ?? [];
        return attempts.some((attempt) => attempt.finishedOn !== null) ? [{ book, attempts }] : [];
      });
    },

    async saveConfiguration(configuration) {
      const { error } = await client.rpc('save_reading_configuration', {
        p_configuration_id: configuration.id,
        p_measure: configuration.measure,
        p_starts_on: configuration.startsOn,
        p_categories: configuration.categories,
      });
      throwIfError(error);
    },

    async updateCategoryColor(position, color) {
      const { error } = await client.from('reading_category_colors').upsert(
        { position, color },
        { onConflict: 'user_id,position' },
      );
      throwIfError(error);
    },

    async startBook(bookId, startedOn) {
      const { error } = await client.rpc('start_reading_attempt', {
        p_book_id: bookId,
        p_started_on: startedOn,
      });
      throwIfError(error);
    },

    async startReread(bookId, startedOn) {
      const { error } = await client.rpc('start_reading_attempt', {
        p_book_id: bookId,
        p_started_on: startedOn,
      });
      throwIfError(error);
    },

    async finishAttempt(attemptId, finishedOn, rating) {
      const { error } = await client.rpc('finish_reading_attempt', {
        p_attempt_id: attemptId,
        p_finished_on: finishedOn,
        p_rating: rating,
      });
      throwIfError(error);
    },

    async updateAttemptFinish(attemptId, finishedOn, rating) {
      const { error } = await client.rpc('update_reading_attempt_finish', {
        p_attempt_id: attemptId,
        p_finished_on: finishedOn,
        p_rating: rating,
      });
      throwIfError(error);
    },

    async updateAttemptStart(attemptId, startedOn) {
      const { error } = await client.rpc('update_reading_attempt_start', {
        p_attempt_id: attemptId,
        p_started_on: startedOn,
      });
      throwIfError(error);
    },

    async updateAttemptReflection(attemptId, reflection) {
      const { error } = await client.from('reading_attempts').update({ reflection }).eq('id', attemptId);
      throwIfError(error);
    },

    async saveDailyTotal(log) {
      const { error } = await client.rpc('save_daily_reading_total', {
        p_log_id: log.id,
        p_book_id: log.bookId,
        p_configuration_id: log.configurationId,
        p_logged_on: log.date,
        p_amount: log.amount,
      });
      throwIfError(error);
    },
  };
}

function mapConfiguration(value: unknown, colorsByPosition: Map<number, string>): ReadingConfiguration {
  const row = asRecord(value);
  const id = stringValue(row.id);
  const measure = parseMeasure(row.measure);
  const startsOn = stringValue(row.starts_on);
  if (!id || !measure || !startsOn) throw new Error('The data service returned an incomplete Reading configuration.');

  return {
    id,
    measure,
    startsOn,
    categories: parseCategories(row.categories).map((category) => ({
      ...category,
      color: colorsByPosition.get(category.position) ?? category.color,
    })),
  };
}

function parseCategories(value: unknown): ReadingCategory[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const category = asRecord(item);
    const position = numberValue(category.position);
    const minimum = numberValue(category.minimum);
    const maximum = nullableNumber(category.maximum);
    const color = stringValue(category.color);
    if (position !== index || minimum < 1 || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new Error('The data service returned an invalid Reading category.');
    }
    return { position, minimum, maximum, color };
  });
}

function mapCurrentAttempt(value: unknown): ReadingAttempt {
  return mapReadingAttempt(value);
}

function mapReadingAttempt(value: unknown): ReadingAttempt {
  const row = asRecord(value);
  const book = asRecord(row.book);
  const attempt = {
    id: stringValue(row.id),
    bookId: stringValue(row.book_id),
    bookTitle: stringValue(book.title),
    startedOn: stringValue(row.started_on),
    finishedOn: nullableString(row.finished_on),
    rating: nullableRating(row.rating),
    reflection: stringValue(row.reflection),
    isCurrent: row.is_current === true,
  };
  if (!attempt.id || !attempt.bookId || !attempt.bookTitle || !attempt.startedOn) {
    throw new Error('The data service returned an incomplete Current book attempt.');
  }
  return attempt;
}

function mapReadingLog(value: unknown): ReadingLog {
  const row = asRecord(value);
  const attempt = asRecord(row.attempt);
  const book = asRecord(attempt.book);
  const configuration = asRecord(row.configuration);
  const measure = parseMeasure(configuration.measure);
  const log = {
    id: stringValue(row.id),
    attemptId: stringValue(row.attempt_id),
    bookId: stringValue(attempt.book_id),
    bookTitle: stringValue(book.title),
    configurationId: stringValue(row.configuration_id),
    date: stringValue(row.logged_on),
    amount: numberValue(row.amount),
    measure,
    categoryPosition: numberValue(row.category_position),
  };
  if (!log.id || !log.attemptId || !log.bookId || !log.bookTitle || !log.configurationId || !log.date || !log.measure) {
    throw new Error('The data service returned an incomplete Reading log.');
  }
  return log as ReadingLog;
}

function parseMeasure(value: unknown): ReadingMeasure | null {
  return value === 'minutes' || value === 'pages' || value === 'chapters' ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableRating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const rating = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!isValidStarRating(rating)) {
    throw new Error('The data service returned an invalid Reading rating.');
  }
  return rating;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function throwIfError(error: unknown): void {
  if (error) throw error;
}
