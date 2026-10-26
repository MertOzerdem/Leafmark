import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { AuthIdentity, ReaderProfileRepository } from '../../auth/contracts';
import type { Book, BookDraft, TbrBook, TbrRepository } from '../../books/bookTypes';
import type { BookPageField, BookPageFieldType, BookPageRepository } from '../../books/bookPageTypes';
import type { BookshelfBook, BookshelfDecoration, BookshelfRepository, ShelfOrientation } from '../../books/bookshelfTypes';
import type {
  ReadBook,
  ReadingAttempt,
  ReadingCategory,
  ReadingConfiguration,
  ReadingConfigurationDraft,
  ReadingLog,
  ReadingLogDraft,
  ReadingRepository,
  ReadingSnapshot,
} from '../../reading/readingTypes';

export interface LocalBookStore {
  books: Book[];
  tbrBookIds: string[];
  categoryColors: Record<string, string>;
  shelfBookIds: string[];
  decorations: BookshelfDecoration[];
  orientations: Record<string, ShelfOrientation>;
  spineColors: Record<string, string>;
  customizedSpineColors: Record<string, boolean>;
  positions: Record<string, { x: number; y: number }>;
  configurations: ReadingConfiguration[];
  attempts: ReadingAttempt[];
  logs: ReadingLog[];
  fields: BookPageField[];
  values: Map<string, string>;
  nextId: number;
}

export interface LocalRepositories {
  profiles: ReaderProfileRepository;
  tbr: TbrRepository;
  reading: ReadingRepository;
  bookPages: BookPageRepository;
  bookshelf: BookshelfRepository;
}

export function createEmptyLocalBookStore(): LocalBookStore {
  return {
    books: [],
    tbrBookIds: [],
    categoryColors: {},
    shelfBookIds: [],
    decorations: [],
    orientations: {},
    spineColors: {},
    customizedSpineColors: {},
    positions: {},
    configurations: [],
    attempts: [],
    logs: [],
    fields: defaultBookPageFields(),
    values: new Map(),
    nextId: 1,
  };
}

export function createLocalRepositories(
  store: LocalBookStore,
  ownerSubject: string,
  persist: () => Promise<void>,
): LocalRepositories {
  return {
    profiles: {
      async loadOrCreate(identity: AuthIdentity) {
        if (identity.subject !== ownerSubject) throw new Error('The demo profile belongs to another reader.');
        return {
          subject: identity.subject,
          username: identity.username,
          privateLabel: `Local shelf for ${identity.username}`,
        };
      },
    },
    tbr: persistAfterWrites(createTbrRepository(store), ['setCategoryColor', 'add', 'update', 'remove', 'reorder'], persist),
    reading: persistAfterWrites(createReadingRepository(store), [
      'saveConfiguration', 'updateCategoryColor', 'startBook', 'startReread', 'finishAttempt',
      'updateAttemptFinish', 'updateAttemptStart', 'updateAttemptReflection', 'saveDailyTotal',
    ], persist),
    bookPages: persistAfterWrites(createBookPageRepository(store, ownerSubject), [
      'addField', 'updateField', 'reorderFields', 'removeField', 'saveValue', 'uploadImage', 'deleteBookPage', 'updateBook',
    ], persist),
    bookshelf: persistAfterWrites(createBookshelfRepository(store), [
      'moveBook', 'setOrientation', 'setSpineColor', 'setDefaultSpineColor', 'addDecoration', 'moveDecoration', 'removeDecoration',
    ], persist),
  };
}

function createTbrRepository(store: LocalBookStore): TbrRepository {
  const listBooks = (): TbrBook[] => store.tbrBookIds.flatMap((id, position) => {
    const book = store.books.find((entry) => entry.id === id);
    return book ? [{ ...book, position }] : [];
  });

  return {
    async list() { return listBooks(); },
    async listCategoryColors() { return { ...store.categoryColors }; },
    async setCategoryColor(category, color) { store.categoryColors[category.trim().toLowerCase()] = color.toUpperCase(); },
    async add(draft) {
      const existing = findMatchingBook(store.books, draft);
      const book = existing ?? { ...draft, id: `local-book-${nextId(store)}` };
      if (!existing) store.books.push(book);
      if (!store.tbrBookIds.includes(book.id)) store.tbrBookIds.push(book.id);
      return { ...book };
    },
    async update(bookId, draft) {
      const existing = store.books.find((entry) => entry.id === bookId);
      if (!existing) throw new Error('Book not found.');
      const updated = { ...draft, id: bookId };
      store.books = store.books.map((entry) => entry.id === bookId ? updated : entry);
      syncAttemptTitles(store, updated);
      return { ...updated };
    },
    async remove(bookId) {
      store.tbrBookIds = store.tbrBookIds.filter((id) => id !== bookId);
    },
    async reorder(bookIds) {
      const existingIds = new Set(store.tbrBookIds);
      if (bookIds.length !== existingIds.size || bookIds.some((id) => !existingIds.has(id))) {
        throw new Error('The new order must contain every demo TBR Book exactly once.');
      }
      store.tbrBookIds = [...bookIds];
    },
  };
}

function createReadingRepository(store: LocalBookStore): ReadingRepository {
  return {
    async loadSnapshot(year) {
      const attempts = store.attempts.map((attempt) => ({ ...attempt }));
      return {
        books: store.books.map((book) => ({ ...book })),
        configurations: store.configurations.map(copyConfiguration),
        currentAttempt: attempts.find((attempt) => attempt.isCurrent) ?? null,
        attempts,
        logs: store.logs.filter((log) => log.date.startsWith(`${year}-`)).map((log) => ({ ...log })),
        usedConfigurationIds: [...new Set(store.logs.map((log) => log.configurationId))],
      } satisfies ReadingSnapshot;
    },
    async loadReadBooks() {
      return store.books.flatMap((book) => {
        const attempts = store.attempts.filter((attempt) => attempt.bookId === book.id).map((attempt) => ({ ...attempt }));
        return attempts.some((attempt) => attempt.finishedOn !== null) ? [{ book: { ...book }, attempts }] : [];
      });
    },
    async saveConfiguration(draft) {
      const configuration: ReadingConfiguration = {
        ...draft,
        id: draft.id ?? `local-configuration-${nextId(store)}`,
        categories: draft.categories.map((category) => ({ ...category })),
      };
      store.configurations = draft.id
        ? store.configurations.map((entry) => entry.id === draft.id ? configuration : entry)
        : [...store.configurations, configuration];
    },
    async updateCategoryColor(position, color) {
      store.configurations = store.configurations.map((configuration) => ({
        ...configuration,
        categories: configuration.categories.map((category) => category.position === position ? { ...category, color } : category),
      }));
    },
    async startBook(bookId, startedOn) {
      const book = requireBook(store, bookId);
      const current = store.attempts.find((attempt) => attempt.isCurrent);
      if (current?.bookId === bookId) {
        updateAttempt(store, current.id, { startedOn });
        return;
      }
      if (current) updateAttempt(store, current.id, { isCurrent: false });
      store.attempts.push(createAttempt(store, book, startedOn, true));
    },
    async startReread(bookId, startedOn) {
      const book = requireBook(store, bookId);
      const current = store.attempts.find((attempt) => attempt.isCurrent);
      if (current) updateAttempt(store, current.id, { isCurrent: false });
      store.attempts.push(createAttempt(store, book, startedOn, true));
    },
    async finishAttempt(attemptId, finishedOn, rating) {
      const attempt = store.attempts.find((entry) => entry.id === attemptId && entry.isCurrent);
      if (!attempt || finishedOn < attempt.startedOn || !isValidDemoRating(rating)) throw new Error('The demo Reading attempt cannot be finished with these details.');
      updateAttempt(store, attemptId, { finishedOn, rating, isCurrent: false });
      store.tbrBookIds = store.tbrBookIds.filter((bookId) => bookId !== attempt.bookId);
      if (!store.shelfBookIds.includes(attempt.bookId)) store.shelfBookIds.push(attempt.bookId);
    },
    async updateAttemptFinish(attemptId, finishedOn, rating) {
      const attempt = store.attempts.find((entry) => entry.id === attemptId && entry.finishedOn !== null);
      if (!attempt || finishedOn < attempt.startedOn || !isValidDemoRating(rating)) throw new Error('The demo Reading attempt cannot be updated with these details.');
      updateAttempt(store, attemptId, { finishedOn, rating });
    },
    async updateAttemptStart(attemptId, startedOn) {
      const attempt = store.attempts.find((entry) => entry.id === attemptId);
      if (!attempt || (attempt.finishedOn && startedOn > attempt.finishedOn)) throw new Error('The demo Reading attempt start date is invalid.');
      updateAttempt(store, attemptId, { startedOn });
    },
    async updateAttemptReflection(attemptId, reflection) {
      if (!store.attempts.some((entry) => entry.id === attemptId)) throw new Error('Reading attempt not found.');
      updateAttempt(store, attemptId, { reflection });
    },
    async saveDailyTotal(input) {
      const configuration = store.configurations.find((entry) => entry.id === input.configurationId);
      const book = requireBook(store, input.bookId);
      if (!configuration) throw new Error('Save reading settings before adding a demo Reading log.');
      const category = categoryForAmount(configuration.categories, input.amount);
      if (!category) throw new Error('No demo Reading category matches this total.');

      const existingLog = input.id ? store.logs.find((entry) => entry.id === input.id) : undefined;
      let attempt = existingLog && existingLog.bookId === input.bookId
        ? store.attempts.find((entry) => entry.id === existingLog.attemptId)
        : undefined;
      const current = store.attempts.find((entry) => entry.isCurrent);
      if (!attempt && current?.bookId === input.bookId) attempt = current;
      if (!attempt) {
        attempt = findAttemptForDate(store.attempts, input.bookId, input.date);
      }
      if (!attempt) {
        const shouldBeCurrent = !current;
        attempt = createAttempt(store, book, input.date, shouldBeCurrent);
        store.attempts.push(attempt);
      }

      const log: ReadingLog = {
        id: input.id ?? `local-log-${nextId(store)}`,
        attemptId: attempt.id,
        bookId: book.id,
        bookTitle: book.title,
        configurationId: configuration.id,
        date: input.date,
        amount: input.amount,
        measure: configuration.measure,
        categoryPosition: category.position,
      };
      store.logs = input.id
        ? store.logs.map((entry) => entry.id === input.id ? log : entry)
        : [...store.logs, log];
    },
  };
}

function createBookPageRepository(store: LocalBookStore, ownerSubject: string): BookPageRepository {
  return {
    async listTemplateFields() {
      return store.fields.filter((field) => field.isTemplate).sort(compareFieldPosition).map(copyField);
    },
    async listFields(bookId) {
      return store.fields
        .filter((field) => field.isTemplate || field.bookId === bookId)
        .sort((left, right) => Number(right.isTemplate) - Number(left.isTemplate) || compareFieldPosition(left, right))
        .map(copyField);
    },
    async listValues(bookId) {
      return store.fields.flatMap((field) => {
        const value = store.values.get(`${bookId}:${field.id}`);
        return value === undefined ? [] : [{ fieldId: field.id, value, displayUrl: value }];
      });
    },
    async addField(input) {
      const field: BookPageField = {
        ...input,
        id: `local-field-${nextId(store)}`,
        isTemplate: input.bookId === null,
      };
      store.fields.push(field);
      return copyField(field);
    },
    async updateField(field) {
      store.fields = store.fields.map((entry) => entry.id === field.id ? copyField(field) : entry);
    },
    async reorderFields(bookId, fieldIds) {
      const scope = store.fields.filter((field) => bookId === null ? field.isTemplate : field.bookId === bookId);
      if (scope.length !== fieldIds.length || fieldIds.some((id) => !scope.some((field) => field.id === id))) {
        throw new Error('The demo Book page field order is invalid.');
      }
      store.fields = store.fields.map((field) => {
        if (bookId === null ? !field.isTemplate : field.bookId !== bookId) return field;
        const position = fieldIds.indexOf(field.id);
        return { ...field, position };
      });
    },
    async removeField(fieldId) {
      store.fields = store.fields.filter((field) => field.id !== fieldId);
      for (const key of store.values.keys()) if (key.endsWith(`:${fieldId}`)) store.values.delete(key);
    },
    async saveValue(bookId, fieldId, value) {
      const key = `${bookId}:${fieldId}`;
      if (value === null) store.values.delete(key);
      else store.values.set(key, value);
    },
    async uploadImage(_ownerSubject, bookId, fieldId, uri) {
      if (Platform.OS === 'web') {
        const localDataUrl = await storeWebImage(uri);
        await this.saveValue(bookId, fieldId, localDataUrl);
        return { value: localDataUrl, displayUrl: localDataUrl };
      }

      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error('Leafmark could not access local document storage on this iPad.');
      const safeOwner = ownerSubject.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeBook = bookId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const folder = `${directory}book-page-images/${safeOwner}/${safeBook}/`;
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
      const extension = uri.split('?')[0]?.split('.').pop()?.match(/^[a-z0-9]{2,5}$/i)?.[0]?.toLowerCase() ?? 'jpg';
      const destination = `${folder}${fieldId}-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: uri, to: destination });
      await this.saveValue(bookId, fieldId, destination);
      return { value: destination, displayUrl: destination };
    },
    async deleteBookPage(bookId) {
      const removedFieldIds = store.fields.filter((field) => field.bookId === bookId).map((field) => field.id);
      store.fields = store.fields.filter((field) => field.bookId !== bookId);
      store.books = store.books.filter((book) => book.id !== bookId);
      store.tbrBookIds = store.tbrBookIds.filter((id) => id !== bookId);
      store.shelfBookIds = store.shelfBookIds.filter((id) => id !== bookId);
      store.attempts = store.attempts.filter((attempt) => attempt.bookId !== bookId);
      store.logs = store.logs.filter((log) => log.bookId !== bookId);
      for (const key of store.values.keys()) {
        if (key.startsWith(`${bookId}:`) || removedFieldIds.some((fieldId) => key.endsWith(`:${fieldId}`))) store.values.delete(key);
      }
      const folder = `${FileSystem.documentDirectory ?? ''}book-page-images/${ownerSubject.replace(/[^a-zA-Z0-9_-]/g, '_')}/${bookId.replace(/[^a-zA-Z0-9_-]/g, '_')}/`;
      if (folder.startsWith(FileSystem.documentDirectory ?? '\u0000')) {
        await FileSystem.deleteAsync(folder, { idempotent: true }).catch(() => undefined);
      }
    },
    async updateBook(bookId, draft) {
      const existing = requireBook(store, bookId);
      const updated = { ...draft, id: existing.id };
      store.books = store.books.map((book) => book.id === bookId ? updated : book);
      syncAttemptTitles(store, updated);
      return { ...updated };
    },
  };
}

async function storeWebImage(uri: string): Promise<string> {
  const response = uri.startsWith('data:') ? null : await fetch(uri);
  const image = response ? await response.blob() : null;
  if (response && !response.ok) throw new Error('The illustration link could not be downloaded.');
  if (image && !image.type.startsWith('image/')) throw new Error('Choose an image file for this Book page.');

  if (!image) return uri;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The illustration could not be stored for offline use.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The illustration could not be stored for offline use.'));
    reader.readAsDataURL(image);
  });
}

function compareFieldPosition(left: BookPageField, right: BookPageField): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

function createBookshelfRepository(store: LocalBookStore): BookshelfRepository {
  const loadBooks = (): BookshelfBook[] => store.shelfBookIds.flatMap((id, index) => {
    const book = store.books.find((entry) => entry.id === id);
    const position = store.positions[id] ?? { x: 0.04 + (index % 7) * 0.13, y: 32 + Math.floor(index / 7) * 270 };
    return book ? [{
      book: { ...book },
      x: position.x,
      y: position.y,
      orientation: store.orientations[id] ?? 'upright',
      spineColor: store.spineColors[id] ?? '#82876A',
      isColorCustomized: store.customizedSpineColors[id] ?? false,
    }] : [];
  });

  return {
    async load() { return { books: loadBooks(), decorations: store.decorations.map((item) => ({ ...item })) }; },
    async moveBook(bookId, x, y) {
      if (!store.shelfBookIds.includes(bookId)) throw new Error('Book not found on the demo bookshelf.');
      store.positions[bookId] = { x: clamp(x, 0, 0.95), y: Math.max(0, y) };
    },
    async setOrientation(bookId, orientation) {
      if (!store.shelfBookIds.includes(bookId)) throw new Error('Book not found on the demo bookshelf.');
      store.orientations[bookId] = orientation;
    },
    async setSpineColor(bookId, color) {
      if (!store.shelfBookIds.includes(bookId)) throw new Error('Book not found on the demo bookshelf.');
      store.spineColors[bookId] = color;
      store.customizedSpineColors[bookId] = true;
    },
    async setDefaultSpineColor(bookId, color) {
      if (!store.shelfBookIds.includes(bookId) || store.customizedSpineColors[bookId]) return false;
      store.spineColors[bookId] = color;
      return true;
    },
    async addDecoration(kind) {
      const maxY = Math.max(0, ...loadBooks().map((book) => book.y), ...store.decorations.map((item) => item.y));
      store.decorations.push({ id: `local-decoration-${nextId(store)}`, kind, x: 0.04, y: maxY === 0 ? 32 : maxY + 270 });
    },
    async moveDecoration(id, x, y) {
      store.decorations = store.decorations.map((item) => item.id === id ? { ...item, x: clamp(x, 0, 0.95), y: Math.max(0, y) } : item);
    },
    async removeDecoration(id) {
      store.decorations = store.decorations.filter((item) => item.id !== id);
    },
  };
}

function defaultBookPageFields(): BookPageField[] {
  const definitions: Array<[string, BookPageFieldType]> = [
    ['Series', 'text'],
    ['Couple', 'text'],
    ['Favorite quotes', 'multiline'],
    ['Personal thoughts', 'multiline'],
    ['Illustration', 'image'],
  ];
  return definitions.map(([label, type], position) => ({
    id: `local-template-${position + 1}`,
    bookId: null,
    label,
    type,
    position,
    isTemplate: true,
  }));
}

function findMatchingBook(books: Book[], draft: BookDraft): Book | undefined {
  const normalizedTitle = normalize(draft.title);
  const normalizedAuthor = normalize(draft.authors[0] ?? '');
  return books.find((book) => normalize(book.title) === normalizedTitle && normalize(book.authors[0] ?? '') === normalizedAuthor);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function copyConfiguration(configuration: ReadingConfiguration): ReadingConfiguration {
  return { ...configuration, categories: configuration.categories.map((category) => ({ ...category })) };
}

function copyField(field: BookPageField): BookPageField {
  return { ...field };
}

function requireBook(store: LocalBookStore, bookId: string): Book {
  const book = store.books.find((entry) => entry.id === bookId);
  if (!book) throw new Error('Book not found in the local demo account.');
  return book;
}

function createAttempt(store: LocalBookStore, book: Book, startedOn: string, isCurrent: boolean): ReadingAttempt {
  return {
    id: `local-attempt-${nextId(store)}`,
    bookId: book.id,
    bookTitle: book.title,
    startedOn,
    finishedOn: null,
    rating: null,
    reflection: '',
    isCurrent,
  };
}

function updateAttempt(store: LocalBookStore, attemptId: string, changes: Partial<ReadingAttempt>): void {
  store.attempts = store.attempts.map((attempt) => attempt.id === attemptId ? { ...attempt, ...changes } : attempt);
}

function syncAttemptTitles(store: LocalBookStore, book: Book): void {
  store.attempts = store.attempts.map((attempt) => attempt.bookId === book.id ? { ...attempt, bookTitle: book.title } : attempt);
  store.logs = store.logs.map((log) => log.bookId === book.id ? { ...log, bookTitle: book.title } : log);
}

function findAttemptForDate(attempts: ReadingAttempt[], bookId: string, date: string): ReadingAttempt | undefined {
  return attempts
    .filter((attempt) => attempt.bookId === bookId && attempt.startedOn <= date && (!attempt.finishedOn || date <= attempt.finishedOn))
    .sort((left, right) => right.startedOn.localeCompare(left.startedOn))[0];
}

function categoryForAmount(categories: ReadingCategory[], amount: number): ReadingCategory | undefined {
  return categories.find((category) => amount >= category.minimum && (category.maximum === null || amount <= category.maximum));
}

function isValidDemoRating(rating: number): boolean {
  return Number.isFinite(rating) && rating >= 1 && rating <= 5 && Number.isInteger(rating * 2);
}

function nextId(store: LocalBookStore): number {
  const id = store.nextId;
  store.nextId += 1;
  return id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function persistAfterWrites<T extends object>(repository: T, mutatingMethods: string[], persist: () => Promise<void>): T {
  const mutatingNames = new Set(mutatingMethods);
  return new Proxy(repository, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver) as unknown;
      if (typeof property !== 'string' || !mutatingNames.has(property) || typeof member !== 'function') return member;

      return async (...args: unknown[]) => {
        const result = await member.apply(target, args);
        await persist();
        return result;
      };
    },
  });
}
