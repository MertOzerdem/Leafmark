import type { SQLiteDatabase } from 'expo-sqlite';

import type { AuthIdentity } from '../../auth/contracts';
import {
  createLocalAuthActions,
  initializeLocalDatabase,
  loadLocalRepositories,
  restoreLocalSession,
} from './localDatabase';

const mockSecureItems = new Map<string, string>();
let mockUuid = 0;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureItems.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureItems.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockSecureItems.delete(key); }),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `local-account-${++mockUuid}`),
  getRandomBytesAsync: jest.fn(async (length: number) => new Uint8Array(length).fill(23)),
}));

interface TestAccount {
  id: string;
  username: string;
  normalized_username: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
}

class MemorySqliteDatabase {
  accounts: TestAccount[] = [];
  workspaces = new Map<string, { state_json: string; updated_at: string }>();

  async execAsync(): Promise<void> {}

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    await task();
  }

  async getFirstAsync<T>(query: string, ...parameters: (string | number | null)[]): Promise<T | null> {
    if (query.includes('FROM local_accounts')) {
      const account = query.includes('normalized_username = ?')
        ? this.accounts.find((row) => row.normalized_username === parameters[0])
        : this.accounts.find((row) => row.id === parameters[0]);
      return account ? ({ id: account.id, username: account.username, normalized_username: account.normalized_username, password_salt: account.password_salt, password_hash: account.password_hash } as T) : null;
    }
    if (query.includes('FROM local_workspaces')) {
      return (this.workspaces.get(String(parameters[0])) ?? null) as T | null;
    }
    return null;
  }

  async runAsync(query: string, ...parameters: (string | number | null)[]): Promise<{ changes: number }> {
    if (query.includes('INSERT INTO local_accounts')) {
      const [, username, normalizedUsername, salt, passwordHash, createdAt] = parameters;
      if (this.accounts.some((row) => row.normalized_username === normalizedUsername)) {
        throw new Error('UNIQUE constraint failed: local_accounts.normalized_username');
      }
      this.accounts.push({
        id: String(parameters[0]),
        username: String(username),
        normalized_username: String(normalizedUsername),
        password_salt: String(salt),
        password_hash: String(passwordHash),
        created_at: String(createdAt),
      });
      return { changes: 1 };
    }
    if (query.includes('INSERT INTO local_workspaces')) {
      this.workspaces.set(String(parameters[0]), { state_json: String(parameters[1]), updated_at: String(parameters[2]) });
      return { changes: 1 };
    }
    return { changes: 0 };
  }
}

describe('local SQLite accounts and reader workspaces', () => {
  beforeEach(() => {
    mockSecureItems.clear();
    mockUuid = 0;
  });

  it('creates a local account, persists its journal, and isolates another account', async () => {
    const database = new MemorySqliteDatabase();
    await initializeLocalDatabase(database as unknown as SQLiteDatabase);
    const changes: Array<AuthIdentity | null> = [];
    const auth = createLocalAuthActions(database as unknown as SQLiteDatabase, async (identity) => { changes.push(identity); });

    await auth.signUp('Reader-Ivy', 'correct horse battery');
    const firstIdentity = changes.at(-1);
    expect(firstIdentity).toEqual({ subject: 'local-account-1', username: 'Reader-Ivy' });
    expect(database.accounts[0]?.password_hash).not.toBe('correct horse battery');
    expect(await restoreLocalSession(database as unknown as SQLiteDatabase)).toEqual(firstIdentity);

    const firstRepositories = await loadLocalRepositories(database as unknown as SQLiteDatabase, firstIdentity!);
    await firstRepositories.tbr.add({
      googleVolumeId: null,
      title: 'The Local Garden',
      authors: ['A. Reader'],
      coverUrl: null,
      categories: ['Fiction'],
      pageCount: 320,
      description: null,
    });

    await auth.signOut();
    await auth.signUp('Reader-Sage', 'another safe password');
    const secondIdentity = changes.at(-1)!;
    const secondRepositories = await loadLocalRepositories(database as unknown as SQLiteDatabase, secondIdentity);
    expect(await secondRepositories.tbr.list()).toEqual([]);

    const reopenedFirstRepositories = await loadLocalRepositories(database as unknown as SQLiteDatabase, firstIdentity!);
    expect((await reopenedFirstRepositories.tbr.list()).map((book) => book.title)).toEqual(['The Local Garden']);
  });

  it('rejects an incorrect local password and normalizes usernames for sign-in', async () => {
    const database = new MemorySqliteDatabase();
    const auth = createLocalAuthActions(database as unknown as SQLiteDatabase, jest.fn(async () => undefined));

    await auth.signUp('Reader-Ivy', 'correct horse battery');
    await expect(auth.signIn('reader-ivy', 'wrong password')).rejects.toThrow('The username or password is incorrect.');
    await expect(auth.signIn('reader-ivy', 'correct horse battery')).resolves.toBeUndefined();
    await expect(auth.signUp('reader-ivy', 'different safe password')).rejects.toThrow('already in use on this iPad');
  });
});
