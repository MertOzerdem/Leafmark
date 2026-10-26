import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('react-native-image-colors', () => ({
  getColors: jest.fn().mockResolvedValue({ platform: 'ios', primary: '#AF633A', background: '#F5F0DF', secondary: '#677744' }),
}));

import { AppFlow } from './AppFlow';
import type { AuthIdentity, AuthActions, AuthSession, ReaderProfileRepository } from '../../auth/contracts';
import type { Book, BookCatalog, BookDraft, TbrBook, TbrRepository } from '../../books/bookTypes';
import type { BookPageField, BookPageFieldType, BookPageRepository } from '../../books/bookPageTypes';
import type { BookshelfBook, BookshelfDecoration, BookshelfRepository, ShelfOrientation } from '../../books/bookshelfTypes';
import type {
  ReadingAttempt,
  ReadingConfiguration,
  ReadingConfigurationDraft,
  ReadingLog,
  ReadingLogDraft,
  ReadBook,
  ReadingRepository,
} from '../../reading/readingTypes';

function TestApp({ initialIdentity = null, seedGardenInTbr = false, seedGardenCover = false }: { initialIdentity?: AuthIdentity | null; seedGardenInTbr?: boolean; seedGardenCover?: boolean }) {
  const [identity, setIdentity] = useState<AuthIdentity | null>(initialIdentity);
  const [isLoaded, setIsLoaded] = useState(true);

  const auth = useMemo<AuthActions>(
    () => ({
      async signIn(username) {
        setIsLoaded(false);
        setIdentity({ subject: `local:${username}`, username });
        setIsLoaded(true);
      },
      async signUp(username) {
        setIsLoaded(false);
        setIdentity({ subject: `local:${username}`, username });
        setIsLoaded(true);
      },
      async signOut() {
        setIdentity(null);
      },
    }),
    [],
  );

  const profiles = useMemo<ReaderProfileRepository>(
    () => ({
      async loadOrCreate(currentIdentity) {
        return {
          subject: currentIdentity.subject,
          username: currentIdentity.username,
          privateLabel: `Local shelf for ${currentIdentity.username}`,
        };
      },
    }),
    [],
  );

  const catalog = useMemo<BookCatalog>(
    () => ({
      async search(query) {
        return query.trim() && !query.toLowerCase().includes('unlisted')
          ? [
              {
                googleVolumeId: 'google-garden',
                title: 'A Garden of Stories',
                authors: ['A. Reader'],
                coverUrl: 'https://books.example/garden.jpg',
                categories: ['Fiction'],
                pageCount: 384,
                description: 'A story among the flowers.',
              },
            ]
          : [];
      },
    }),
    [],
  );

  const bookStore = useMemo(() => createTestBookStore(seedGardenInTbr, seedGardenCover), [seedGardenCover, seedGardenInTbr]);
  const tbr = useMemo<TbrRepository>(() => createTestTbrRepository(bookStore), [bookStore]);
  const reading = useMemo<ReadingRepository>(() => createTestReadingRepository(bookStore), [bookStore]);
  const bookPages = useMemo<BookPageRepository>(() => createTestBookPageRepository(bookStore), [bookStore]);
  const bookshelf = useMemo<BookshelfRepository>(() => createTestBookshelfRepository(bookStore), [bookStore]);

  const session: AuthSession = { isLoaded, identity };

  return <AppFlow auth={auth} session={session} profiles={profiles} catalog={catalog} tbr={tbr} reading={reading} bookPages={bookPages} bookshelf={bookshelf} />;
}

interface TestBookStore {
  books: Book[];
  tbrBookIds: string[];
  categoryColors: Record<string, string>;
  shelfBookIds: string[];
  decorations: BookshelfDecoration[];
  orientations: Record<string, ShelfOrientation>;
  spineColors: Record<string, string>;
  customizedSpineColors: Record<string, boolean>;
  positions: Record<string, { x: number; y: number }>;
}

function createTestBookStore(seedGardenInTbr: boolean, seedGardenCover: boolean): TestBookStore {
  return {
    books: [
    {
      id: 'garden',
      googleVolumeId: 'garden-volume',
      title: 'A Garden of Stories',
      authors: ['A. Reader'],
      coverUrl: seedGardenCover ? 'https://books.example/garden-cover.jpg' : null,
      categories: ['Fiction'],
      pageCount: 384,
      description: null,
    },
    {
      id: 'map',
      googleVolumeId: null,
      title: 'Map of Quiet Stars',
      authors: ['M. Writer'],
      coverUrl: null,
      categories: ['Fantasy'],
      pageCount: 275,
      description: null,
    },
    ],
    tbrBookIds: seedGardenInTbr ? ['garden'] : [],
    categoryColors: {},
    shelfBookIds: [],
    decorations: [],
    orientations: {},
    spineColors: {},
    customizedSpineColors: {},
    positions: {},
  };
}

function createTestReadingRepository(bookStore: TestBookStore): ReadingRepository {
  let configurations: ReadingConfiguration[] = [];
  let currentAttempt: ReadingAttempt | null = null;
  let attempts: ReadingAttempt[] = [];
  let logs: ReadingLog[] = [];
  let nextId = 1;

  return {
    async loadSnapshot(year) {
      return {
        books: bookStore.books.map((book) => ({ ...book })),
        configurations: configurations.map((configuration) => ({
          ...configuration,
          categories: configuration.categories.map((category) => ({ ...category })),
        })),
        currentAttempt: currentAttempt ? { ...currentAttempt } : null,
        attempts: attempts.map((attempt) => ({ ...attempt })),
        logs: logs.filter((log) => log.date.startsWith(`${year}-`)).map((log) => ({ ...log })),
        usedConfigurationIds: [...new Set(logs.map((log) => log.configurationId))],
      };
    },
    async loadReadBooks(): Promise<ReadBook[]> {
      return bookStore.books.flatMap((book) => {
        const bookAttempts = attempts.filter((attempt) => attempt.bookId === book.id).map((attempt) => ({ ...attempt }));
        return bookAttempts.some((attempt) => attempt.finishedOn !== null) ? [{ book: { ...book }, attempts: bookAttempts }] : [];
      });
    },
    async saveConfiguration(draft: ReadingConfigurationDraft) {
      const configuration: ReadingConfiguration = {
        ...draft,
        id: draft.id ?? `configuration-${nextId++}`,
        categories: draft.categories.map((category) => ({ ...category })),
      };
      configurations = draft.id
        ? configurations.map((existing) => existing.id === draft.id ? configuration : existing)
        : [...configurations, configuration];
    },
    async updateCategoryColor(position: number, color: string) {
      configurations = configurations.map((configuration) => ({
        ...configuration,
        categories: configuration.categories.map((category) => category.position === position ? { ...category, color } : category),
      }));
    },
    async startBook(bookId: string, startedOn: string) {
      const book = bookStore.books.find((entry) => entry.id === bookId);
      if (!book) throw new Error('Book not found');
      if (currentAttempt?.bookId === bookId) {
        currentAttempt = { ...currentAttempt, startedOn };
        attempts = attempts.map((attempt) => attempt.id === currentAttempt?.id ? currentAttempt : attempt);
        return;
      }
      if (currentAttempt) {
        attempts = attempts.map((attempt) => attempt.id === currentAttempt?.id ? { ...attempt, isCurrent: false } : attempt);
      }
      currentAttempt = createAttempt(`attempt-${nextId++}`, bookId, book.title, startedOn);
      attempts = [...attempts, currentAttempt];
    },
    async startReread(bookId: string, startedOn: string) {
      const book = bookStore.books.find((entry) => entry.id === bookId);
      if (!book) throw new Error('Book not found');
      if (currentAttempt) {
        attempts = attempts.map((attempt) => attempt.id === currentAttempt?.id ? { ...attempt, isCurrent: false } : attempt);
      }
      currentAttempt = createAttempt(`attempt-${nextId++}`, bookId, book.title, startedOn);
      attempts = [...attempts, currentAttempt];
    },
    async finishAttempt(attemptId, finishedOn, rating) {
      const attempt = attempts.find((entry) => entry.id === attemptId && entry.isCurrent);
      if (!attempt) throw new Error('Current attempt not found');
      attempts = attempts.map((entry) => entry.id === attemptId ? { ...entry, finishedOn, rating, isCurrent: false } : entry);
      currentAttempt = null;
      bookStore.tbrBookIds = bookStore.tbrBookIds.filter((bookId) => bookId !== attempt.bookId);
      if (!bookStore.shelfBookIds.includes(attempt.bookId)) bookStore.shelfBookIds.push(attempt.bookId);
    },
    async updateAttemptFinish(attemptId, finishedOn, rating) {
      const attempt = attempts.find((entry) => entry.id === attemptId && entry.finishedOn !== null);
      if (!attempt) throw new Error('Finished attempt not found');
      attempts = attempts.map((entry) => entry.id === attemptId ? { ...entry, finishedOn, rating } : entry);
    },
    async updateAttemptStart(attemptId: string, startedOn: string) {
      const existing = attempts.find((attempt) => attempt.id === attemptId);
      if (!existing) throw new Error('Reading attempt not found');
      const updated = { ...existing, startedOn };
      if (currentAttempt?.id === attemptId) currentAttempt = updated;
      attempts = attempts.map((attempt) => attempt.id === attemptId ? updated : attempt);
    },
    async updateAttemptReflection(attemptId: string, reflection: string) {
      attempts = attempts.map((attempt) => attempt.id === attemptId ? { ...attempt, reflection } : attempt);
    },
    async saveDailyTotal(input: ReadingLogDraft) {
      const configuration = configurations.find((entry) => entry.id === input.configurationId);
      const book = bookStore.books.find((entry) => entry.id === input.bookId);
      if (!configuration || !book) throw new Error('Reading setup is incomplete');

      let attempt = currentAttempt?.bookId === input.bookId ? currentAttempt : null;
      if (!attempt && input.id) {
        const savedLog = logs.find((entry) => entry.id === input.id);
        if (savedLog?.bookId === input.bookId) {
          attempt = attempts.find((entry) => entry.id === savedLog.attemptId) ?? null;
        }
      }
      if (!attempt) {
        attempt = createAttempt(`attempt-${nextId++}`, book.id, book.title, input.date);
        attempts = [...attempts, attempt];
        if (!input.id) currentAttempt = attempt;
      }

      const category = configuration.categories.find((entry) => input.amount >= entry.minimum && (entry.maximum === null || input.amount <= entry.maximum));
      if (!category) throw new Error('No reading category matches the total');
      const log: ReadingLog = {
        id: input.id ?? `log-${nextId++}`,
        attemptId: attempt.id,
        bookId: book.id,
        bookTitle: book.title,
        configurationId: configuration.id,
        date: input.date,
        amount: input.amount,
        measure: configuration.measure,
        categoryPosition: category.position,
      };
      logs = input.id
        ? logs.map((existing) => existing.id === input.id ? log : existing)
        : [...logs, log];
    },
  };
}

function createAttempt(id: string, bookId: string, bookTitle: string, startedOn: string): ReadingAttempt {
  return { id, bookId, bookTitle, startedOn, finishedOn: null, rating: null, reflection: '', isCurrent: true };
}

function createTestBookPageRepository(bookStore: TestBookStore): BookPageRepository {
  let nextId = 1;
  let fields: BookPageField[] = [
    { id: 'series', bookId: null, label: 'Series', type: 'text', position: 0, isTemplate: true },
    { id: 'couple', bookId: null, label: 'Couple', type: 'text', position: 1, isTemplate: true },
    { id: 'quotes', bookId: null, label: 'Favorite quotes', type: 'multiline', position: 2, isTemplate: true },
    { id: 'thoughts', bookId: null, label: 'Personal thoughts', type: 'multiline', position: 3, isTemplate: true },
    { id: 'illustration', bookId: null, label: 'Illustration', type: 'image', position: 4, isTemplate: true },
  ];
  const values = new Map<string, string>();
  const imageDisplays = new Map<string, string>();
  return {
    async listTemplateFields() { return fields.filter((field) => field.isTemplate).map((field) => ({ ...field })); },
    async listFields(bookId) { return fields.filter((field) => field.bookId === null || field.bookId === bookId).map((field) => ({ ...field })); },
    async listValues(bookId) {
      return fields.flatMap((field) => {
        const value = values.get(`${bookId}:${field.id}`);
        return value === undefined ? [] : [{ fieldId: field.id, value, displayUrl: imageDisplays.get(`${bookId}:${field.id}`) ?? value }];
      });
    },
    async addField(input) {
      const field: BookPageField = { ...input, id: `page-field-${nextId++}`, isTemplate: input.bookId === null };
      fields = [...fields, field];
      return field;
    },
    async updateField(field) { fields = fields.map((entry) => entry.id === field.id ? { ...field } : entry); },
    async reorderFields(bookId, fieldIds) {
      const scope = fields.filter((field) => field.bookId === bookId);
      const updated = fieldIds.map((id, position) => {
        const field = scope.find((entry) => entry.id === id);
        if (!field) throw new Error('Field not found');
        return { ...field, position };
      });
      fields = [...fields.filter((field) => field.bookId !== bookId), ...updated];
    },
    async removeField(fieldId) { fields = fields.filter((field) => field.id !== fieldId); },
    async saveValue(bookId, fieldId, value) {
      const key = `${bookId}:${fieldId}`;
      if (value === null) { values.delete(key); imageDisplays.delete(key); }
      else values.set(key, value);
    },
    async uploadImage(_ownerSubject, bookId, fieldId, uri) {
      const value = `storage://${bookId}/${fieldId}/private-image.jpg`;
      imageDisplays.set(`${bookId}:${fieldId}`, uri.startsWith('file:') ? uri : `https://storage.example/${bookId}/${fieldId}`);
      return { value, displayUrl: imageDisplays.get(`${bookId}:${fieldId}`) ?? '' };
    },
    async deleteBookPage(bookId) {
      bookStore.books = bookStore.books.filter((book) => book.id !== bookId);
      bookStore.tbrBookIds = bookStore.tbrBookIds.filter((id) => id !== bookId);
      bookStore.shelfBookIds = bookStore.shelfBookIds.filter((id) => id !== bookId);
    },
    async updateBook(bookId, draft) {
      const existing = bookStore.books.find((book) => book.id === bookId);
      if (!existing) throw new Error('Book not found');
      const updated = { ...draft, id: bookId };
      bookStore.books = bookStore.books.map((book) => book.id === bookId ? updated : book);
      return updated;
    },
  };
}

function createTestBookshelfRepository(bookStore: TestBookStore): BookshelfRepository {
  let nextId = 1;
  const loadBooks = (): BookshelfBook[] => bookStore.shelfBookIds.flatMap((id, index) => {
    const book = bookStore.books.find((entry) => entry.id === id);
    const position = bookStore.positions[id] ?? { x: 0.04 + (index % 7) * 0.13, y: 32 + Math.floor(index / 7) * 270 };
    return book ? [{ book: { ...book }, x: position.x, y: position.y, orientation: bookStore.orientations[id] ?? 'upright', spineColor: bookStore.spineColors[id] ?? '#82876A', isColorCustomized: bookStore.customizedSpineColors[id] ?? false }] : [];
  });
  return {
    async load() { return { books: loadBooks(), decorations: bookStore.decorations.map((item) => ({ ...item })) }; },
    async moveBook(bookId, x, y) { if (!bookStore.shelfBookIds.includes(bookId)) throw new Error('Book not found'); bookStore.positions[bookId] = { x, y }; },
    async setOrientation(bookId, orientation) { bookStore.orientations[bookId] = orientation; },
    async setSpineColor(bookId, color) { bookStore.spineColors[bookId] = color; bookStore.customizedSpineColors[bookId] = true; },
    async setDefaultSpineColor(bookId, color) {
      if (bookStore.customizedSpineColors[bookId]) return false;
      bookStore.spineColors[bookId] = color;
      return true;
    },
    async addDecoration(kind) { bookStore.decorations.push({ id: `decoration-${nextId++}`, kind, x: 0.04, y: bookStore.decorations.length === 0 && loadBooks().length === 0 ? 32 : 32 + (loadBooks().length + bookStore.decorations.length) * 270 }); },
    async moveDecoration(id, x, y) { bookStore.decorations = bookStore.decorations.map((item) => item.id === id ? { ...item, x, y } : item); },
    async removeDecoration(id) { bookStore.decorations = bookStore.decorations.filter((item) => item.id !== id); },
  };
}

function createTestTbrRepository(bookStore: TestBookStore): TbrRepository {
  let nextId = 1;
  const listBooks = (): TbrBook[] => bookStore.tbrBookIds.flatMap((id, position) => {
    const book = bookStore.books.find((entry) => entry.id === id);
    return book ? [{ ...book, position }] : [];
  });

  return {
    async list() {
      return listBooks();
    },
    async listCategoryColors() {
      return { ...bookStore.categoryColors };
    },
    async setCategoryColor(category, color) {
      bookStore.categoryColors[category.trim().toLowerCase()] = color;
    },
    async add(draft) {
      const book: Book = { ...draft, id: `book-${nextId++}` };
      bookStore.books = [...bookStore.books, book];
      bookStore.tbrBookIds = [...bookStore.tbrBookIds, book.id];
      return { ...book, position: bookStore.tbrBookIds.length - 1 };
    },
    async update(bookId, draft) {
      const existing = bookStore.books.find((book) => book.id === bookId);
      if (!existing) throw new Error('Book not found');
      bookStore.books = bookStore.books.map((book) => (book.id === bookId ? { ...book, ...draft } : book));
      const updatedBook = listBooks().find((book) => book.id === bookId);
      if (!updatedBook) throw new Error('Book not found');
      return { ...updatedBook };
    },
    async remove(bookId) {
      bookStore.tbrBookIds = bookStore.tbrBookIds.filter((id) => id !== bookId);
    },
    async reorder(bookIds) {
      const currentIds = new Set(bookStore.tbrBookIds);
      if (bookIds.length !== currentIds.size || bookIds.some((id) => !currentIds.has(id))) throw new Error('TBR book not found');
      bookStore.tbrBookIds = [...bookIds];
    },
  };
}

describe('private account app flow', () => {
  it('creates a username/password account, opens only that reader shelf, and signs out', async () => {
    await render(<TestApp />);

    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await fireEvent.changeText(screen.getByLabelText('Username'), 'reader-ivy');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'correct horse battery');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByText('Local shelf for reader-ivy')).toBeTruthy());
    expect(screen.getByText('Local account on this iPad · reader-ivy')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByText('Your reading life, gathered in one place.')).toBeTruthy());
    expect(screen.queryByText('Local shelf for reader-ivy')).toBeNull();
  });

  it('loads private profile data using the signed-in account identity', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-sage', username: 'reader-sage' }} />);

    await waitFor(() => expect(screen.getByText('Local shelf for reader-sage')).toBeTruthy());
    expect(screen.getByText('Local account on this iPad · reader-sage')).toBeTruthy();
  });

  it('signs into an existing account with its username and password', async () => {
    await render(<TestApp />);

    await fireEvent.changeText(screen.getByLabelText('Username'), 'reader-sage');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'reader password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByText('Local shelf for reader-sage')).toBeTruthy());
    expect(screen.getByText('Local account on this iPad · reader-sage')).toBeTruthy();
  });

  it('keeps the private app shell hidden while the auth session is unresolved', async () => {
    function UnresolvedSession() {
      const auth: AuthActions = {
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
      };
      const profiles: ReaderProfileRepository = { loadOrCreate: jest.fn() };
      const catalog: BookCatalog = { search: jest.fn() };
      const tbr: TbrRepository = {
        list: jest.fn(),
        listCategoryColors: jest.fn(),
        setCategoryColor: jest.fn(),
        add: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        reorder: jest.fn(),
      };
      const reading: ReadingRepository = {
        loadSnapshot: jest.fn(),
        loadReadBooks: jest.fn(),
        saveConfiguration: jest.fn(),
        updateCategoryColor: jest.fn(),
        startBook: jest.fn(),
        startReread: jest.fn(),
        finishAttempt: jest.fn(),
        updateAttemptFinish: jest.fn(),
        updateAttemptStart: jest.fn(),
        updateAttemptReflection: jest.fn(),
        saveDailyTotal: jest.fn(),
      };
      const bookPages: BookPageRepository = {
        listTemplateFields: jest.fn(),
        listFields: jest.fn(),
        listValues: jest.fn(),
        addField: jest.fn(),
        updateField: jest.fn(),
        reorderFields: jest.fn(),
        removeField: jest.fn(),
        saveValue: jest.fn(),
        uploadImage: jest.fn(),
        deleteBookPage: jest.fn(),
        updateBook: jest.fn(),
      };
      const bookshelf: BookshelfRepository = {
        load: jest.fn(),
        moveBook: jest.fn(),
        setOrientation: jest.fn(),
        setSpineColor: jest.fn(),
        setDefaultSpineColor: jest.fn(),
        addDecoration: jest.fn(),
        moveDecoration: jest.fn(),
        removeDecoration: jest.fn(),
      };
      return (
        <AppFlow
          auth={auth}
          session={{ isLoaded: false, identity: { subject: 'local:pending', username: 'pending' } }}
          profiles={profiles}
          catalog={catalog}
          tbr={tbr}
          reading={reading}
          bookPages={bookPages}
          bookshelf={bookshelf}
        />
      );
    }

    await render(<UnresolvedSession />);

    expect(screen.queryByText('Local shelf for pending')).toBeNull();
    expect(screen.getByTestId('session-loading')).toBeTruthy();
  });

  it('tracks one daily total for the Current book and lets the reader correct its date and Book', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-june', username: 'reader-june' }} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await waitFor(() => expect(screen.getByText('2027 Reading Log')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Set reading measure to Pages' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save reading settings' }));
    await waitFor(() => expect(screen.getByText('Pages · starting 2027-01-01')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-02');
    await fireEvent.press(screen.getByRole('button', { name: 'Start A Garden of Stories' }));
    await waitFor(() => expect(screen.getByText('Current book: A Garden of Stories')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Reading date'), '2027-01-03');
    await fireEvent.changeText(screen.getByLabelText('Pages read'), '25');
    await fireEvent.press(screen.getByRole('button', { name: 'Save daily total' }));
    await waitFor(() => expect(screen.getByText('A Garden of Stories · 2027-01-03 · 25 pages')).toBeTruthy());
    expect(screen.getByLabelText('January 3: 25 pages, category 11–30 pages')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit reading log for A Garden of Stories dated 2027-01-03' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose Map of Quiet Stars for daily total' }));
    await fireEvent.changeText(screen.getByLabelText('Reading date'), '2027-01-04');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Map of Quiet Stars · 2027-01-04 · 25 pages')).toBeTruthy());
    expect(screen.getByText('Current book: A Garden of Stories')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Set reading measure to Chapters' }));
    await fireEvent.changeText(screen.getByLabelText('Reading baseline starts on'), '2027-02-01');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reading settings' }));
    await waitFor(() => expect(screen.getByText('Chapters · starting 2027-02-01')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Reading date'), '2027-02-05');
    await fireEvent.changeText(screen.getByLabelText('Chapters read'), '2');
    await fireEvent.press(screen.getByRole('button', { name: 'Save daily total' }));
    await waitFor(() => expect(screen.getByText('A Garden of Stories · 2027-02-05 · 2 chapters')).toBeTruthy());
    expect(screen.getByText('Map of Quiet Stars · 2027-01-04 · 25 pages')).toBeTruthy();
  });

  it('keeps same-day totals separate when the reader starts a new measure baseline', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-baseline', username: 'reader-baseline' }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Set reading measure to Pages' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save reading settings' }));
    await waitFor(() => expect(screen.getByText('Pages · starting 2027-01-01')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-03');
    await fireEvent.press(screen.getByRole('button', { name: 'Start A Garden of Stories' }));
    await fireEvent.changeText(screen.getByLabelText('Reading date'), '2027-01-03');
    await fireEvent.changeText(screen.getByLabelText('Pages read'), '25');
    await fireEvent.press(screen.getByRole('button', { name: 'Save daily total' }));

    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-03');
    await fireEvent.press(screen.getByRole('button', { name: 'Start Map of Quiet Stars' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Set reading measure to Minutes' }));
    await fireEvent.changeText(screen.getByLabelText('Reading baseline starts on'), '2027-01-03');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reading settings' }));
    await waitFor(() => expect(screen.getByText('Minutes · starting 2027-01-03')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Reading date'), '2027-01-03');
    await fireEvent.changeText(screen.getByLabelText('Minutes read'), '30');
    await fireEvent.press(screen.getByRole('button', { name: 'Save daily total' }));

    const annualDay = screen.getByRole('button', { name: /January 3: 30 minutes, category 11–30 minutes, 1 other total/ });
    expect(annualDay).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open January 2027' }));
    const monthDay = screen.getByRole('button', { name: /2027-01-03, A Garden of Stories 25 pages, Map of Quiet Stars 30 minutes/ });
    expect(monthDay).toBeTruthy();
    await fireEvent.press(monthDay);
    expect(screen.getByText('Day total · 25 pages')).toBeTruthy();
    expect(screen.getByText('Day total · 30 minutes')).toBeTruthy();
  });

  it('finishes a Book, removes it from TBR, and records a reread on the same Book page', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-rose', username: 'reader-rose' }} seedGardenInTbr />);

    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-02');
    await fireEvent.press(screen.getByRole('button', { name: 'Start A Garden of Stories' }));
    await waitFor(() => expect(screen.getByText('Current book: A Garden of Stories')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Finish current book' }));
    await fireEvent.changeText(screen.getByLabelText('Finish date'), '2027-01-12');
    expect(screen.queryByRole('button', { name: 'Rate 0.5 stars' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rate 1 stars' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rate 1.5 stars' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rate 5 stars' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Rate 4.5 stars' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish book' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Open Read Books' }));
    await waitFor(() => expect(screen.getByText('Read books · 1 unique Book')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Open TBR' }));
    expect(screen.getByText('Your list · 0')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Read Books' }));
    expect(screen.getByText('Reading attempts · 1')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Open A Garden of Stories' }));
    expect(screen.getAllByText('A Garden of Stories').length).toBeGreaterThan(0);
    expect(screen.getByText('2027-01-02 → 2027-01-12 · 4.5 stars')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Start date for 2027-01-02'), '2027-01-01');
    await fireEvent.press(screen.getByRole('button', { name: 'Save start date' }));
    await waitFor(() => expect(screen.getByText('2027-01-01 → 2027-01-12 · 4.5 stars')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Reread start date'), '2027-02-01');
    await fireEvent.press(screen.getByRole('button', { name: 'Read this Book again' }));

    expect(screen.getByText('Reading attempts · 2')).toBeTruthy();
    expect(screen.getByText('In progress · started 2027-02-01')).toBeTruthy();
  });

  it('opens month details with daily totals, start and finish events, and yearly reread counts', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-calendar', username: 'reader-calendar' }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Set reading measure to Pages' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save reading settings' }));
    await waitFor(() => expect(screen.getByText('Pages · starting 2027-01-01')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-02');
    await fireEvent.press(screen.getByRole('button', { name: 'Start A Garden of Stories' }));
    await fireEvent.changeText(screen.getByLabelText('Reading date'), '2027-01-03');
    await fireEvent.changeText(screen.getByLabelText('Pages read'), '25');
    await fireEvent.press(screen.getByRole('button', { name: 'Save daily total' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish current book' }));
    await fireEvent.changeText(screen.getByLabelText('Finish date'), '2027-01-12');
    await fireEvent.press(screen.getByRole('button', { name: 'Rate 4.5 stars' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish book' }));

    expect(screen.getByText('1 unique Books · 1 finished Reading attempts · 0 rereads')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open January 2027' }));
    expect(screen.getByTestId('month-calendar')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /2027-01-03, A Garden of Stories 25 pages/ }));
    expect(screen.getByText('A Garden of Stories · 25 pages')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /2027-01-02.*started A Garden of Stories/ }));
    expect(screen.getByText('✦ Started A Garden of Stories')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /2027-01-12.*finished A Garden of Stories/ }));
    expect(screen.getByText('♛ Finished A Garden of Stories')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Custom color for category 2'), '#123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Save custom color for category 2' }));
    await waitFor(() => {
      const loggedDay = screen.getByRole('button', { name: /2027-01-03, A Garden of Stories 25 pages/ });
      expect(loggedDay.props.style).toContainEqual({ backgroundColor: '#123456' });
    });
  });

  it('personalizes Book pages with a reusable template, private fields, Undo, and delete confirmation', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-notes', username: 'reader-notes' }} seedGardenInTbr />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-02');
    await fireEvent.press(screen.getByRole('button', { name: 'Start A Garden of Stories' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish current book' }));
    await fireEvent.changeText(screen.getByLabelText('Finish date'), '2027-01-12');
    await fireEvent.press(screen.getByRole('button', { name: 'Rate 4.5 stars' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish book' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open Read Books' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Customize Book page template' }));
    await fireEvent.changeText(screen.getByLabelText('Template field name'), 'Mood');
    await fireEvent.press(screen.getByRole('button', { name: 'List' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to all Book pages' }));
    await waitFor(() => expect(screen.getByLabelText('Template field 6')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: '‹ Read Books' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open A Garden of Stories' }));
    await waitFor(() => expect(screen.getByText('Mood · template')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Book-only field name'), 'Favorite chapter');
    await fireEvent.press(screen.getByRole('button', { name: 'Add Book-only field' }));
    await waitFor(() => expect(screen.getByLabelText('Favorite chapter')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Favorite chapter'), 'Chapter 12');
    await fireEvent.press(screen.getByRole('button', { name: 'Save Favorite chapter' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo last edit to Favorite chapter' })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Undo last edit to Favorite chapter' }));
    await waitFor(() => expect(screen.getByLabelText('Favorite chapter').props.value).toBe(''));

    await fireEvent.changeText(screen.getByLabelText('Illustration'), 'https://images.example.com/cover-illustration.jpg');
    await fireEvent.press(screen.getByRole('button', { name: 'Save Illustration' }));
    await waitFor(() => expect(screen.getAllByLabelText('Illustration').length).toBeGreaterThan(1));
    await fireEvent.changeText(screen.getByLabelText('Finish date for 2027-01-02'), '2027-01-13');
    expect(screen.queryByRole('button', { name: 'Edit rating 0.5 stars for 2027-01-02' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit rating 1 stars for 2027-01-02' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit rating 1.5 stars for 2027-01-02' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit rating 4 stars for 2027-01-02' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save finish details for 2027-01-02' }));
    await waitFor(() => expect(screen.getByText('2027-01-02 → 2027-01-13 · 4 stars')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: 'Delete Book page' }));
    expect(screen.getByText('Delete “A Garden of Stories”?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep Book' }));
    expect(screen.getByTestId('book-page')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete Book page' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(screen.queryByTestId('book-page')).toBeNull());
    expect(screen.getByText('Finished Books will gather here with their reading history.')).toBeTruthy();
  });

  it('uses the bookshelf as home and saves automatic placement, orientation, colors, and decorations', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-shelf', username: 'reader-shelf' }} seedGardenInTbr seedGardenCover />);
    expect(screen.getByTestId('digital-bookshelf')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-02');
    await fireEvent.press(screen.getByRole('button', { name: 'Start A Garden of Stories' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish current book' }));
    await fireEvent.changeText(screen.getByLabelText('Finish date'), '2027-01-12');
    await fireEvent.press(screen.getByRole('button', { name: 'Rate 4.5 stars' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish book' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open My Bookshelf' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Shelf item A Garden of Stories' })).toBeTruthy());
    await waitFor(() => expect(StyleSheet.flatten(screen.getByTestId('book-spine-garden').props.style).backgroundColor).toBe('#AF633A'));
    await fireEvent(screen.getByRole('button', { name: 'Shelf item A Garden of Stories' }), 'accessibilityTap');
    await fireEvent.press(screen.getByRole('button', { name: 'Tilted' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Set A Garden of Stories spine color to #66798A' }));
    await fireEvent.press(screen.getByRole('button', { name: '＋ Plant' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Shelf decoration Small plant' })).toBeTruthy());
    expect(screen.getByTestId('bookshelf-scroll-view').props.style.maxHeight).toBe(720);

    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open My Bookshelf' }));
    await fireEvent(screen.getByRole('button', { name: 'Shelf item A Garden of Stories' }), 'accessibilityTap');
    expect(screen.getByRole('button', { name: 'Tilted' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'Set A Garden of Stories spine color to #66798A' }).props.accessibilityLabel).toContain('#66798A');
    expect(screen.getByRole('button', { name: 'Shelf decoration Small plant' })).toBeTruthy();
  });

  it('searches, manually adds, edits, reorders, and removes Books in the TBR', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-ivy', username: 'reader-ivy' }} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Open TBR' }));
    await waitFor(() => expect(screen.getAllByText('To Be Read').length).toBeGreaterThan(0));
    await fireEvent.changeText(screen.getByLabelText('Search books by title or author'), 'garden stories');
    await fireEvent.press(screen.getByRole('button', { name: 'Search Google Books' }));
    await waitFor(() => expect(screen.getAllByText('A Garden of Stories').length).toBeGreaterThan(0));
    expect(screen.getByText('384 pages')).toBeTruthy();
    expect(screen.getByText('Fiction')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Add to TBR: A Garden of Stories' }));
    await waitFor(() => {
      const tbrTitles = screen.getAllByTestId('tbr-book-title').map((title) => title.props.children);
      expect(tbrTitles).toEqual(['A Garden of Stories']);
    });
    expect(screen.getByLabelText('TBR marker: Fiction')).toBeTruthy();
    expect(screen.getByTestId('tbr-list')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit color for Fiction' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Set Fiction color to #D59AAA' }));
    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('TBR marker: Fiction').props.style).color).toBe('#D59AAA'));
    await fireEvent.press(screen.getByRole('button', { name: 'Open Reading tracker' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open TBR' }));
    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('TBR marker: Fiction').props.style).color).toBe('#D59AAA'));

    await fireEvent.press(screen.getByRole('button', { name: 'Add book manually' }));
    await fireEvent.changeText(screen.getByLabelText('Book title'), 'Map of Quiet Stars');
    await fireEvent.changeText(screen.getByLabelText('Authors'), 'M. Writer');
    await fireEvent.changeText(screen.getByLabelText('Categories'), 'Fantasy, Romance');
    await fireEvent.changeText(screen.getByLabelText('Page count'), '275');
    await fireEvent.press(screen.getByRole('button', { name: 'Save to TBR' }));

    await waitFor(() => expect(screen.getAllByText('Map of Quiet Stars').length).toBeGreaterThan(0));
    await fireEvent.press(screen.getByRole('button', { name: 'Move Map of Quiet Stars up' }));
    await waitFor(() => {
      const tbrTitles = screen.getAllByTestId('tbr-book-title').map((title) => title.props.children);
      expect(tbrTitles).toEqual(['Map of Quiet Stars', 'A Garden of Stories']);
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Edit Map of Quiet Stars' }));
    await fireEvent.changeText(screen.getByLabelText('Book title'), 'Map of Quiet Stars, Revised');
    await fireEvent.changeText(screen.getByLabelText('Page count'), '280');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getAllByText('Map of Quiet Stars, Revised').length).toBeGreaterThan(0));

    await fireEvent.press(screen.getByRole('button', { name: 'Remove A Garden of Stories from TBR' }));
    await waitFor(() => {
      const tbrTitles = screen.getAllByTestId('tbr-book-title').map((title) => title.props.children);
      expect(tbrTitles).toEqual(['Map of Quiet Stars, Revised']);
    });
  });

  it('lets a reader create a manual Book when Google Books has no suitable result', async () => {
    await render(<TestApp initialIdentity={{ subject: 'local:reader-june', username: 'reader-june' }} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Open TBR' }));
    await fireEvent.changeText(screen.getByLabelText('Search books by title or author'), 'unlisted novel');
    await fireEvent.press(screen.getByRole('button', { name: 'Search Google Books' }));
    await waitFor(() => expect(screen.getByText('No matches found. Add the book manually instead.')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Add book manually' }));
    await fireEvent.changeText(screen.getByLabelText('Book title'), 'An Unlisted Novel');
    await fireEvent.changeText(screen.getByLabelText('Authors'), 'J. Reader');
    await fireEvent.press(screen.getByRole('button', { name: 'Save to TBR' }));

    await waitFor(() => expect(screen.getAllByText('An Unlisted Novel').length).toBeGreaterThan(0));
    expect(screen.getByText('J. Reader')).toBeTruthy();
  });
});
