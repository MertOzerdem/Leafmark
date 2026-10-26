import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AppFlow } from './AppFlow';
import type { AuthIdentity, AuthActions, AuthSession, ReaderProfileRepository } from '../../auth/contracts';
import type { Book, BookCatalog, BookDraft, TbrBook, TbrRepository } from '../../books/bookTypes';
import type {
  ReadingAttempt,
  ReadingConfiguration,
  ReadingConfigurationDraft,
  ReadingLog,
  ReadingLogDraft,
  ReadBook,
  ReadingRepository,
} from '../../reading/readingTypes';

function TestApp({ initialIdentity = null, seedGardenInTbr = false }: { initialIdentity?: AuthIdentity | null; seedGardenInTbr?: boolean }) {
  const [identity, setIdentity] = useState<AuthIdentity | null>(initialIdentity);
  const [isLoaded, setIsLoaded] = useState(true);

  const auth = useMemo<AuthActions>(
    () => ({
      async signIn(username) {
        setIsLoaded(false);
        setIdentity({ subject: `clerk:${username}`, username });
        setIsLoaded(true);
      },
      async signUp(username) {
        setIsLoaded(false);
        setIdentity({ subject: `clerk:${username}`, username });
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
          privateLabel: `Private shelf for ${currentIdentity.username}`,
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

  const bookStore = useMemo(() => createTestBookStore(seedGardenInTbr), [seedGardenInTbr]);
  const tbr = useMemo<TbrRepository>(() => createTestTbrRepository(bookStore), [bookStore]);
  const reading = useMemo<ReadingRepository>(() => createTestReadingRepository(bookStore), [bookStore]);

  const session: AuthSession = { isLoaded, identity };

  return <AppFlow auth={auth} session={session} profiles={profiles} catalog={catalog} tbr={tbr} reading={reading} />;
}

interface TestBookStore {
  books: Book[];
  tbrBookIds: string[];
}

function createTestBookStore(seedGardenInTbr: boolean): TestBookStore {
  return {
    books: [
    {
      id: 'garden',
      googleVolumeId: 'garden-volume',
      title: 'A Garden of Stories',
      authors: ['A. Reader'],
      coverUrl: null,
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
    },
    async updateAttemptStart(attemptId: string, startedOn: string) {
      if (!currentAttempt || currentAttempt.id !== attemptId) throw new Error('Reading attempt not found');
      currentAttempt = { ...currentAttempt, startedOn };
      attempts = attempts.map((attempt) => attempt.id === attemptId ? currentAttempt as ReadingAttempt : attempt);
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
  return { id, bookId, bookTitle, startedOn, finishedOn: null, rating: null, isCurrent: true };
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

    await waitFor(() => expect(screen.getByText('Private shelf for reader-ivy')).toBeTruthy());
    expect(screen.getByText('Signed in as reader-ivy')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByText('Your reading life, gathered in one place.')).toBeTruthy());
    expect(screen.queryByText('Private shelf for reader-ivy')).toBeNull();
  });

  it('loads private profile data using the signed-in account identity', async () => {
    await render(<TestApp initialIdentity={{ subject: 'clerk:reader-sage', username: 'reader-sage' }} />);

    await waitFor(() => expect(screen.getByText('Private shelf for reader-sage')).toBeTruthy());
    expect(screen.getByText('Signed in as reader-sage')).toBeTruthy();
  });

  it('signs into an existing account with its username and password', async () => {
    await render(<TestApp />);

    await fireEvent.changeText(screen.getByLabelText('Username'), 'reader-sage');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'reader password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByText('Private shelf for reader-sage')).toBeTruthy());
    expect(screen.getByText('Signed in as reader-sage')).toBeTruthy();
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
        updateAttemptStart: jest.fn(),
        saveDailyTotal: jest.fn(),
      };
      return (
        <AppFlow
          auth={auth}
          session={{ isLoaded: false, identity: { subject: 'clerk:pending', username: 'pending' } }}
          profiles={profiles}
          catalog={catalog}
          tbr={tbr}
          reading={reading}
        />
      );
    }

    await render(<UnresolvedSession />);

    expect(screen.queryByText('Private shelf for pending')).toBeNull();
    expect(screen.getByTestId('session-loading')).toBeTruthy();
  });

  it('tracks one daily total for the Current book and lets the reader correct its date and Book', async () => {
    await render(<TestApp initialIdentity={{ subject: 'clerk:reader-june', username: 'reader-june' }} />);

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
  });

  it('finishes a Book, removes it from TBR, and records a reread on the same Book page', async () => {
    await render(<TestApp initialIdentity={{ subject: 'clerk:reader-rose', username: 'reader-rose' }} seedGardenInTbr />);

    await fireEvent.changeText(screen.getByLabelText('Book start date'), '2027-01-02');
    await fireEvent.press(screen.getByRole('button', { name: 'Start A Garden of Stories' }));
    await waitFor(() => expect(screen.getByText('Current book: A Garden of Stories')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Finish current book' }));
    await fireEvent.changeText(screen.getByLabelText('Finish date'), '2027-01-12');
    await fireEvent.press(screen.getByRole('button', { name: 'Rate 4.5 stars' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish book' }));

    await waitFor(() => expect(screen.getByText('Read books · 1 unique Book')).toBeTruthy());
    expect(screen.getByText('Your list · 0')).toBeTruthy();
    expect(screen.getByText('Reading attempts · 1')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Open A Garden of Stories' }));
    expect(screen.getByText('Book page: A Garden of Stories')).toBeTruthy();
    expect(screen.getByText('2027-01-02 → 2027-01-12 · 4.5 stars')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reread start date'), '2027-02-01');
    await fireEvent.press(screen.getByRole('button', { name: 'Read this Book again' }));

    await waitFor(() => expect(screen.getByText('Current book: A Garden of Stories')).toBeTruthy());
    expect(screen.getByText('Reading attempts · 2')).toBeTruthy();
    expect(screen.getByText('In progress · started 2027-02-01')).toBeTruthy();
  });

  it('searches, manually adds, edits, reorders, and removes Books in the TBR', async () => {
    await render(<TestApp initialIdentity={{ subject: 'clerk:reader-ivy', username: 'reader-ivy' }} />);

    await waitFor(() => expect(screen.getByText('To Be Read')).toBeTruthy());
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
    await render(<TestApp initialIdentity={{ subject: 'clerk:reader-june', username: 'reader-june' }} />);

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
