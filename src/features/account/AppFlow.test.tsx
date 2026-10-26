import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AppFlow } from './AppFlow';
import type { AuthIdentity, AuthActions, AuthSession, ReaderProfileRepository } from '../../auth/contracts';

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

  const session: AuthSession = { isLoaded, identity };

  return <AppFlow auth={auth} session={session} profiles={profiles} />;
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
      return (
        <AppFlow
          auth={auth}
          session={{ isLoaded: false, identity: { subject: 'clerk:pending', username: 'pending' } }}
          profiles={profiles}
        />
      );
    }

    await render(<UnresolvedSession />);

    expect(screen.queryByText('Private shelf for pending')).toBeNull();
    expect(screen.getByTestId('session-loading')).toBeTruthy();
  });
});
