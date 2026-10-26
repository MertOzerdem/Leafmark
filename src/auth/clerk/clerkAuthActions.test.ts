import { createClerkAuthActions } from './clerkAuthActions';

describe('Clerk password adapter', () => {
  it('signs in by username and activates the completed Clerk session', async () => {
    const signIn = {
      status: 'complete',
      password: jest.fn().mockResolvedValue({ error: null }),
      finalize: jest.fn().mockResolvedValue({ error: null }),
    };
    const signUp = {
      status: 'missing_requirements',
      password: jest.fn(),
      finalize: jest.fn(),
    };
    const signOut = jest.fn().mockResolvedValue(undefined);
    const auth = createClerkAuthActions(signIn, signUp, signOut);

    await auth.signIn('reader-ivy', 'a password');

    expect(signIn.password).toHaveBeenCalledWith({ identifier: 'reader-ivy', password: 'a password' });
    expect(signIn.finalize).toHaveBeenCalledTimes(1);
  });

  it('creates an account using only the chosen username and password', async () => {
    const signIn = {
      status: 'complete',
      password: jest.fn(),
      finalize: jest.fn(),
    };
    const signUp = {
      status: 'complete',
      password: jest.fn().mockResolvedValue({ error: null }),
      finalize: jest.fn().mockResolvedValue({ error: null }),
    };
    const auth = createClerkAuthActions(signIn, signUp, jest.fn());

    await auth.signUp('reader-ivy', 'a password');

    expect(signUp.password).toHaveBeenCalledWith({ username: 'reader-ivy', password: 'a password' });
    expect(signUp.finalize).toHaveBeenCalledTimes(1);
  });

  it('does not activate an incomplete sign-up', async () => {
    const signIn = {
      status: 'complete',
      password: jest.fn(),
      finalize: jest.fn(),
    };
    const signUp = {
      status: 'missing_requirements',
      password: jest.fn().mockResolvedValue({ error: null }),
      finalize: jest.fn(),
    };
    const auth = createClerkAuthActions(signIn, signUp, jest.fn());

    await expect(auth.signUp('reader-ivy', 'a password')).rejects.toThrow('needs extra information');
    expect(signUp.finalize).not.toHaveBeenCalled();
  });
});
