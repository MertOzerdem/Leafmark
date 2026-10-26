import type { AuthActions } from '../contracts';

interface ClerkActionResult {
  error: unknown | null;
}

interface ClerkSignInFlow {
  status: string | null | undefined;
  password(params: { identifier: string; password: string }): Promise<ClerkActionResult>;
  finalize(): Promise<ClerkActionResult>;
}

interface ClerkSignUpFlow {
  status: string | null | undefined;
  password(params: { username: string; password: string }): Promise<ClerkActionResult>;
  finalize(): Promise<ClerkActionResult>;
}

export function createClerkAuthActions(
  signIn: ClerkSignInFlow,
  signUp: ClerkSignUpFlow,
  signOut: () => Promise<unknown>,
): AuthActions {
  return {
    async signIn(username, password) {
      const { error } = await signIn.password({ identifier: username, password });
      if (error) throw error;
      if (signIn.status !== 'complete') {
        throw new Error('This account needs an additional sign-in step that is not enabled yet.');
      }

      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) throw finalizeError;
    },
    async signUp(username, password) {
      const { error } = await signUp.password({ username, password });
      if (error) throw error;
      if (signUp.status !== 'complete') {
        throw new Error('The account needs extra information. Check the username and password settings in Clerk.');
      }

      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) throw finalizeError;
    },
    async signOut() {
      await signOut();
    },
  };
}
