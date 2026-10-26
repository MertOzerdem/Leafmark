import React, { useMemo, useRef } from 'react';
import { ClerkProvider, useAuth, useClerk, useSession, useSignIn, useSignUp, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { createClient } from '@supabase/supabase-js';

import type { AuthSession } from '../contracts';
import { AppFlow } from '../../features/account/AppFlow';
import { createGoogleBooksCatalog } from '../../catalog/googleBooksCatalog';
import { createReaderProfileRepository } from '../../data/readerProfileRepository';
import { createBookPageRepository } from '../../data/bookPageRepository';
import { createBookshelfRepository } from '../../data/bookshelfRepository';
import { createReadingRepository } from '../../data/readingRepository';
import { createTbrRepository } from '../../data/tbrRepository';
import { createClerkAuthActions } from './clerkAuthActions';

interface ClerkAppProps {
  clerkPublishableKey: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export function ClerkApp({ clerkPublishableKey, supabaseUrl, supabasePublishableKey }: ClerkAppProps) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <AuthenticatedApp supabaseUrl={supabaseUrl} supabasePublishableKey={supabasePublishableKey} />
    </ClerkProvider>
  );
}

function AuthenticatedApp({ supabaseUrl, supabasePublishableKey }: Omit<ClerkAppProps, 'clerkPublishableKey'>) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user, isLoaded: userIsLoaded } = useUser();
  const { session } = useSession();
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const supabase = useMemo(
    () =>
      createClient(supabaseUrl, supabasePublishableKey, {
        accessToken: async () => sessionRef.current?.getToken() ?? null,
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      }),
    [supabasePublishableKey, supabaseUrl],
  );
  const profiles = useMemo(() => createReaderProfileRepository(supabase), [supabase]);
  const bookPages = useMemo(() => createBookPageRepository(supabase), [supabase]);
  const bookshelf = useMemo(() => createBookshelfRepository(supabase), [supabase]);
  const reading = useMemo(() => createReadingRepository(supabase), [supabase]);
  const tbr = useMemo(() => createTbrRepository(supabase), [supabase]);
  const catalog = useMemo(() => createGoogleBooksCatalog(), []);

  const auth = useMemo(
    () => createClerkAuthActions(signIn, signUp, () => clerk.signOut()),
    [clerk, signIn, signUp],
  );

  const authSession: AuthSession = {
    isLoaded: isLoaded && userIsLoaded,
    identity:
      isSignedIn && userId && user
        ? { subject: userId, username: user.username ?? userId }
        : null,
  };

  return <AppFlow auth={auth} session={authSession} profiles={profiles} catalog={catalog} tbr={tbr} reading={reading} bookPages={bookPages} bookshelf={bookshelf} />;
}
