import React, { useMemo, useRef } from 'react';
import { ClerkProvider, useAuth, useClerk, useSession, useSignIn, useSignUp, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { createClient } from '@supabase/supabase-js';

import type { AuthSession } from '../contracts';
import { AppFlow } from '../../features/account/AppFlow';
import { createReaderProfileRepository } from '../../data/readerProfileRepository';
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

  return <AppFlow auth={auth} session={authSession} profiles={profiles} />;
}
