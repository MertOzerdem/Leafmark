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
  ReadingRepository,
} from '../../reading/readingTypes';

function TestApp({ initialIdentity = null }: { initialIdentity?: AuthIdentity | null }) {
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

  const tbr = useMemo<TbrRepository>(() => createTestTbrRepository(), []);
  const reading = useMemo<ReadingRepository>(() => createTestReadingRepository(), []);

  const session: AuthSession = { isLoaded, identity };

  return <AppFlow auth={auth} session={session} profiles={profiles} catalog={catalog} tbr={tbr} reading={reading} />;
}

function createTestReadingRepository(): ReadingRepository {
  const books: Book[] = [
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
  ];
  let configurations: ReadingConfiguration[] = [];
  let currentAttempt: ReadingAttempt | null = null;
  let logs: ReadingLog[] = [];
  let nextId = 1;

  return {
    async loadSnapshot(year) {
      return {
        books: books.map((book) => ({ ...book })),
        configurations: configurations.map((configuration) => ({
          ...configuration,
          categories: configuration.categories.map((category) => ({ ...category })),
        })),
        currentAttempt: currentAttempt ? { ...currentAttempt } : null,
        logs: logs.filter((log) => log.date.startsWith(`${year}-`)).map((log) => ({ ...log })),
        usedConfigurationIds: [...new Set(logs.map((log) => log.configurationId))],
      };
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
      const book = books.find((entry) => entry.id === bookId);
      if (!book) throw new Error('Book not found');
      currentAttempt = { id: `attempt-${nextId++}`, bookId, bookTitle: book.title, startedOn };
    },
    async updateAttemptStart(attemptId: string, startedOn: string) {
      if (!currentAttempt || currentAttempt.id !== attemptId) throw new Error('Reading attempt not found');
      currentAttempt = { ...currentAttempt, startedOn };
    },
    async saveDailyTotal(input: ReadingLogDraft) {
      const configuration = configurations.find((entry) => entry.id === input.configurationId);
      const book = books.find((entry) => entry.id === input.bookId);
      if (!configuration || !book) throw new Error('Reading setup is incomplete');

      let attempt = currentAttempt?.bookId === input.bookId ? currentAttempt : null;
      if (!attempt && input.id) {
        const savedLog = logs.find((entry) => entry.id === input.id);
        if (savedLog?.bookId === input.bookId) {
          attempt = { id: savedLog.attemptId, bookId: book.id, bookTitle: book.title, startedOn: input.date };
        }
      }
      if (!attempt) {
        attempt = { id: `attempt-${nextId++}`, bookId: book.id, bookTitle: book.title, startedOn: input.date };
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

function createTestTbrRepository(): TbrRepository {
  let nextId = 1;
  let books: TbrBook[] = [];
  const createBook = (id: string, draft: BookDraft, position: number): TbrBook => ({
    ...draft,
    id,
    position,
  });

  return {
    async list() {
      return books.map((book) => ({ ...book }));
    },
    async add(draft) {
      const book = createBook(`book-${nextId++}`, draft, books.length);
      books = [...books, book];
      return { ...book };
    },
    async update(bookId, draft) {
      const existing = books.find((book) => book.id === bookId);
      if (!existing) throw new Error('Book not found');
      books = books.map((book) => (book.id === bookId ? { ...book, ...draft } : book));
      const updatedBook = books.find((book) => book.id === bookId);
      if (!updatedBook) throw new Error('Book not found');
      return { ...updatedBook };
    },
    async remove(bookId) {
      books = books.filter((book) => book.id !== bookId);
    },
    async reorder(bookIds) {
      books = bookIds.map((bookId, position) => {
        const book = books.find((entry) => entry.id === bookId);
        if (!book) throw new Error('Book not found');
        return { ...book, position };
      });
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
        saveConfiguration: jest.fn(),
        updateCategoryColor: jest.fn(),
        startBook: jest.fn(),
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
    await waitFor(() => expect(screen.getByText('Map of Quiet Stars, Revised')).toBeTruthy());

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

    await waitFor(() => expect(screen.getByText('An Unlisted Novel')).toBeTruthy());
    expect(screen.getByText('J. Reader')).toBeTruthy();
  });
});
