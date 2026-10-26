import type { Book } from '../books/bookTypes';

export type ReadingMeasure = 'minutes' | 'pages' | 'chapters';

export interface ReadingCategory {
  position: number;
  minimum: number;
  maximum: number | null;
  color: string;
}

export interface ReadingConfiguration {
  id: string;
  measure: ReadingMeasure;
  startsOn: string;
  categories: ReadingCategory[];
}

export interface ReadingAttempt {
  id: string;
  bookId: string;
  bookTitle: string;
  startedOn: string;
}

export interface ReadingLog {
  id: string;
  attemptId: string;
  bookId: string;
  bookTitle: string;
  configurationId: string;
  date: string;
  amount: number;
  measure: ReadingMeasure;
  categoryPosition: number;
}

export interface ReadingSnapshot {
  books: Book[];
  configurations: ReadingConfiguration[];
  usedConfigurationIds: string[];
  currentAttempt: ReadingAttempt | null;
  logs: ReadingLog[];
}

export interface ReadingConfigurationDraft {
  id: string | null;
  measure: ReadingMeasure;
  startsOn: string;
  categories: ReadingCategory[];
}

export interface ReadingLogDraft {
  id: string | null;
  bookId: string;
  configurationId: string;
  date: string;
  amount: number;
}

export interface ReadingRepository {
  loadSnapshot(year: number): Promise<ReadingSnapshot>;
  saveConfiguration(configuration: ReadingConfigurationDraft): Promise<void>;
  updateCategoryColor(position: number, color: string): Promise<void>;
  startBook(bookId: string, startedOn: string): Promise<void>;
  updateAttemptStart(attemptId: string, startedOn: string): Promise<void>;
  saveDailyTotal(log: ReadingLogDraft): Promise<void>;
}
