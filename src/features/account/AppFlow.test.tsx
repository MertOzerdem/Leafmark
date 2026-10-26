import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AppFlow } from './AppFlow';
import type { AuthIdentity, AuthActions, AuthSession, ReaderProfileRepository } from '../../auth/contracts';
import type { BookCatalog, BookDraft, TbrBook, TbrRepository } from '../../books/bookTypes';

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

  const session: AuthSession = { isLoaded, identity };

  return <AppFlow auth={auth} session={session} profiles={profiles} catalog={catalog} tbr={tbr} />;
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
      return (
        <AppFlow
          auth={auth}
          session={{ isLoaded: false, identity: { subject: 'clerk:pending', username: 'pending' } }}
          profiles={profiles}
          catalog={catalog}
          tbr={tbr}
        />
      );
    }

    await render(<UnresolvedSession />);

    expect(screen.queryByText('Private shelf for pending')).toBeNull();
    expect(screen.getByTestId('session-loading')).toBeTruthy();
  });

  it('searches, manually adds, edits, reorders, and removes Books in the TBR', async () => {
    await render(<TestApp initialIdentity={{ subject: 'clerk:reader-ivy', username: 'reader-ivy' }} />);

    await waitFor(() => expect(screen.getByText('To Be Read')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Search books by title or author'), 'garden stories');
    await fireEvent.press(screen.getByRole('button', { name: 'Search Google Books' }));
    await waitFor(() => expect(screen.getByText('A Garden of Stories')).toBeTruthy());
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

    await waitFor(() => expect(screen.getByText('Map of Quiet Stars')).toBeTruthy());
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
