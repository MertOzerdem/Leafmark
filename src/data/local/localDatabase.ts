import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { AuthActions, AuthIdentity } from '../../auth/contracts';
import type { LocalBookStore, LocalRepositories } from './localRepositories';
import { createEmptyLocalBookStore, createLocalRepositories } from './localRepositories';

const activeAccountKey = 'leafmark.active-local-account';
const passwordHashRounds = 120_000;

interface LocalAccountRow {
  id: string;
  username: string;
  normalized_username: string;
  password_salt: string;
  password_hash: string;
}

interface LocalWorkspaceRow {
  state_json: string;
}

type SerializedLocalBookStore = Omit<LocalBookStore, 'values'> & { values: Array<[string, string]> };

export async function initializeLocalDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS local_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL,
      normalized_username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_workspaces (
      account_id TEXT PRIMARY KEY NOT NULL REFERENCES local_accounts(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export async function restoreLocalSession(database: SQLiteDatabase): Promise<AuthIdentity | null> {
  const accountId = await SecureStore.getItemAsync(activeAccountKey);
  if (!accountId) return null;

  const account = await database.getFirstAsync<Pick<LocalAccountRow, 'id' | 'username'>>(
    'SELECT id, username FROM local_accounts WHERE id = ?',
    accountId,
  );
  if (!account) {
    await SecureStore.deleteItemAsync(activeAccountKey);
    return null;
  }
  return { subject: account.id, username: account.username };
}

export function createLocalAuthActions(
  database: SQLiteDatabase,
  onSessionChanged: (identity: AuthIdentity | null) => Promise<void>,
): AuthActions {
  return {
    async signUp(username, password) {
      const displayName = username.trim();
      const normalizedUsername = normalizeUsername(displayName);
      validateCredentials(displayName, password);

      const existing = await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM local_accounts WHERE normalized_username = ?',
        normalizedUsername,
      );
      if (existing) throw new Error('That username is already in use on this iPad.');

      const id = Crypto.randomUUID();
      const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
      const passwordHash = await hashPassword(password, salt);
      const createdAt = new Date().toISOString();
      const store = createEmptyLocalBookStore();

      try {
        await database.withTransactionAsync(async () => {
          await database.runAsync(
            'INSERT INTO local_accounts (id, username, normalized_username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            id,
            displayName,
            normalizedUsername,
            salt,
            passwordHash,
            createdAt,
          );
          await insertWorkspace(database, id, store);
        });
      } catch (error) {
        if (String(error).includes('UNIQUE constraint failed')) {
          throw new Error('That username is already in use on this iPad.');
        }
        throw error;
      }

      await SecureStore.setItemAsync(activeAccountKey, id);
      await onSessionChanged({ subject: id, username: displayName });
    },

    async signIn(username, password) {
      const normalizedUsername = normalizeUsername(username.trim());
      const account = await database.getFirstAsync<LocalAccountRow>(
        'SELECT id, username, normalized_username, password_salt, password_hash FROM local_accounts WHERE normalized_username = ?',
        normalizedUsername,
      );
      if (!account || !password) throw new Error('The username or password is incorrect.');

      const attempt = await hashPassword(password, account.password_salt);
      if (!constantTimeEquals(attempt, account.password_hash)) {
        throw new Error('The username or password is incorrect.');
      }

      await SecureStore.setItemAsync(activeAccountKey, account.id);
      await onSessionChanged({ subject: account.id, username: account.username });
    },

    async signOut() {
      await SecureStore.deleteItemAsync(activeAccountKey);
      await onSessionChanged(null);
    },
  };
}

export async function loadLocalRepositories(
  database: SQLiteDatabase,
  identity: AuthIdentity,
): Promise<LocalRepositories> {
  const store = await loadWorkspace(database, identity.subject);
  return createLocalRepositories(store, identity.subject, () => saveWorkspace(database, identity.subject, store));
}

export function createEmptyLocalRepositories(
  ownerSubject: string,
): LocalRepositories {
  const store = createEmptyLocalBookStore();
  return createLocalRepositories(store, ownerSubject, async () => undefined);
}

async function loadWorkspace(database: SQLiteDatabase, accountId: string): Promise<LocalBookStore> {
  const row = await database.getFirstAsync<LocalWorkspaceRow>(
    'SELECT state_json FROM local_workspaces WHERE account_id = ?',
    accountId,
  );
  if (!row) {
    const store = createEmptyLocalBookStore();
    await insertWorkspace(database, accountId, store);
    return store;
  }

  try {
    const parsed = JSON.parse(row.state_json) as Partial<SerializedLocalBookStore>;
    const defaults = createEmptyLocalBookStore();
    return {
      ...defaults,
      ...parsed,
      values: new Map(Array.isArray(parsed.values) ? parsed.values : []),
    } as LocalBookStore;
  } catch {
    throw new Error('Leafmark could not read this iPad account’s local journal data.');
  }
}

async function insertWorkspace(database: SQLiteDatabase, accountId: string, store: LocalBookStore): Promise<void> {
  await database.runAsync(
    'INSERT INTO local_workspaces (account_id, state_json, updated_at) VALUES (?, ?, ?)',
    accountId,
    serializeStore(store),
    new Date().toISOString(),
  );
}

async function saveWorkspace(database: SQLiteDatabase, accountId: string, store: LocalBookStore): Promise<void> {
  await database.runAsync(
    'INSERT INTO local_workspaces (account_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at',
    accountId,
    serializeStore(store),
    new Date().toISOString(),
  );
}

function serializeStore(store: LocalBookStore): string {
  const serializable: SerializedLocalBookStore = {
    ...store,
    values: [...store.values.entries()],
  };
  return JSON.stringify(serializable);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return bytesToHex(await pbkdf2Async(sha256, password, salt, { c: passwordHashRounds, dkLen: 32 }));
}

function validateCredentials(username: string, password: string): void {
  if (username.length < 4 || username.length > 64) throw new Error('Choose a username between 4 and 64 characters.');
  if (password.length < 8 || password.length > 128) throw new Error('Choose a password between 8 and 128 characters.');
}

function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
