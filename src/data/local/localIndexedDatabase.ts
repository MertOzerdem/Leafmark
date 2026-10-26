import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

import type { AuthActions, AuthIdentity } from '../../auth/contracts';
import type { LocalBookStore, LocalRepositories } from './localRepositories';
import { createEmptyLocalBookStore, createLocalRepositories } from './localRepositories';

const databaseName = 'leafmark-local-journal';
const databaseVersion = 1;
const activeSessionKey = 'active';
const passwordHashRounds = 120_000;

interface LocalAccountRecord {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface LocalWorkspaceRecord {
  accountId: string;
  stateJson: string;
  updatedAt: string;
}

interface LocalSessionRecord {
  key: string;
  accountId: string;
}

type SerializedLocalBookStore = Omit<LocalBookStore, 'values'> & { values: Array<[string, string]> };

export type PersistentStorageStatus =
  | 'checking'
  | 'granted'
  | 'not-granted'
  | 'unsupported'
  | 'home-screen-required';

export function openLocalIndexedDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('accounts')) {
        const accounts = database.createObjectStore('accounts', { keyPath: 'id' });
        accounts.createIndex('normalizedUsername', 'normalizedUsername', { unique: true });
      }
      if (!database.objectStoreNames.contains('workspaces')) {
        database.createObjectStore('workspaces', { keyPath: 'accountId' });
      }
      if (!database.objectStoreNames.contains('sessions')) {
        database.createObjectStore('sessions', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Leafmark could not open browser storage.'));
    request.onblocked = () => reject(new Error('Close other Leafmark tabs before opening the local journal.'));
  });
}

export async function restoreLocalIndexedSession(database: IDBDatabase): Promise<AuthIdentity | null> {
  const session = await readRecord<LocalSessionRecord>(database, 'sessions', activeSessionKey);
  if (!session) return null;

  const account = await readRecord<LocalAccountRecord>(database, 'accounts', session.accountId);
  if (!account) {
    await deleteRecord(database, 'sessions', activeSessionKey);
    return null;
  }

  return { subject: account.id, username: account.username };
}

export function createIndexedLocalAuthActions(
  database: IDBDatabase,
  onSessionChanged: (identity: AuthIdentity | null) => Promise<void>,
): AuthActions {
  return {
    async signUp(username, password) {
      const displayName = username.trim();
      validateCredentials(displayName, password);
      if (await readAccountByUsername(database, normalizeLocalUsername(displayName))) {
        throw new Error('That username is already in use on this iPad.');
      }

      const id = createId();
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordHash = await hashPassword(password, salt);
      const identity = { subject: id, username: displayName };
      const account: LocalAccountRecord = {
        id,
        username: displayName,
        normalizedUsername: normalizeLocalUsername(displayName),
        passwordSalt: salt,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      const workspace = createEmptyLocalBookStore();
      const transaction = database.transaction(['accounts', 'workspaces', 'sessions'], 'readwrite');
      const committed = transactionComplete(transaction);

      transaction.objectStore('accounts').add(account);
      transaction.objectStore('workspaces').add({
        accountId: id,
        stateJson: serializeStore(workspace),
        updatedAt: new Date().toISOString(),
      } satisfies LocalWorkspaceRecord);
      transaction.objectStore('sessions').put({ key: activeSessionKey, accountId: id } satisfies LocalSessionRecord);

      try {
        await committed;
      } catch (error) {
        if (isConstraintError(error)) throw new Error('That username is already in use on this iPad.');
        throw error;
      }

      await onSessionChanged(identity);
    },

    async signIn(username, password) {
      const displayName = username.trim();
      const normalizedUsername = normalizeLocalUsername(displayName);
      const account = await readAccountByUsername(database, normalizedUsername, displayName);
      if (!account || !password) throw new Error('The username or password is incorrect.');

      const attempt = await hashPassword(password, account.passwordSalt);
      if (!constantTimeEquals(attempt, account.passwordHash)) {
        throw new Error('The username or password is incorrect.');
      }

      const transaction = database.transaction('sessions', 'readwrite');
      const committed = transactionComplete(transaction);
      transaction.objectStore('sessions').put({ key: activeSessionKey, accountId: account.id } satisfies LocalSessionRecord);
      await committed;
      await onSessionChanged({ subject: account.id, username: account.username });
    },

    async signOut() {
      await deleteRecord(database, 'sessions', activeSessionKey);
      await onSessionChanged(null);
    },
  };
}

export async function loadIndexedLocalRepositories(
  database: IDBDatabase,
  identity: AuthIdentity,
): Promise<LocalRepositories> {
  const workspace = await readRecord<LocalWorkspaceRecord>(database, 'workspaces', identity.subject);
  const store = workspace ? deserializeStore(workspace.stateJson) : createEmptyLocalBookStore();
  if (!workspace) await saveWorkspace(database, identity.subject, store);
  return createLocalRepositories(store, identity.subject, () => saveWorkspace(database, identity.subject, store));
}

export async function requestPersistentStorage(
  isHomeScreenApp: boolean,
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined,
): Promise<PersistentStorageStatus> {
  if (!isHomeScreenApp) return 'home-screen-required';
  if (!storage || typeof storage.persisted !== 'function' || typeof storage.persist !== 'function') {
    return 'unsupported';
  }

  try {
    if (await storage.persisted()) return 'granted';
  } catch {
    // A failed status query should still allow the browser to grant storage below.
  }

  try {
    return await storage.persist() ? 'granted' : 'not-granted';
  } catch {
    return 'not-granted';
  }
}

export function persistentStorageMessage(status: PersistentStorageStatus): string {
  switch (status) {
    case 'checking':
      return 'Checking storage protection for this iPad…';
    case 'granted':
      return 'Persistent storage is enabled for this iPad.';
    case 'not-granted':
      return 'Persistent storage was not granted. Safari may remove this site’s data.';
    case 'unsupported':
      return 'This browser cannot protect the journal from site-data cleanup.';
    case 'home-screen-required':
      return 'Open Leafmark from the Home Screen to request persistent storage.';
  }
}

function readAccountByUsername(database: IDBDatabase, normalizedUsername: string, exactUsername?: string): Promise<LocalAccountRecord | undefined> {
  return new Promise((resolve, reject) => {
    const request = database.transaction('accounts', 'readonly').objectStore('accounts').getAll();
    request.onsuccess = () => {
      const accounts = request.result as LocalAccountRecord[];
      const exact = exactUsername ? accounts.find((account) => account.username.trim() === exactUsername) : undefined;
      resolve(exact ?? accounts.find((account) => normalizeLocalUsername(account.username) === normalizedUsername));
    };
    request.onerror = () => reject(request.error ?? new Error('Leafmark could not read local accounts.'));
  });
}

function readRecord<T>(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error('Leafmark could not read local data.'));
  });
}

async function deleteRecord(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
  const transaction = database.transaction(storeName, 'readwrite');
  const committed = transactionComplete(transaction);
  transaction.objectStore(storeName).delete(key);
  await committed;
}

async function saveWorkspace(database: IDBDatabase, accountId: string, store: LocalBookStore): Promise<void> {
  const transaction = database.transaction('workspaces', 'readwrite');
  const committed = transactionComplete(transaction);
  transaction.objectStore('workspaces').put({
    accountId,
    stateJson: serializeStore(store),
    updatedAt: new Date().toISOString(),
  } satisfies LocalWorkspaceRecord);
  await committed;
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('The local change could not be saved.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('The local change could not be saved.'));
  });
}

function serializeStore(store: LocalBookStore): string {
  const serializable: SerializedLocalBookStore = {
    ...store,
    values: [...store.values.entries()],
  };
  return JSON.stringify(serializable);
}

function deserializeStore(stateJson: string): LocalBookStore {
  try {
    const parsed = JSON.parse(stateJson) as Partial<SerializedLocalBookStore>;
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

async function hashPassword(password: string, salt: string): Promise<string> {
  return bytesToHex(await pbkdf2Async(sha256, password, salt, { c: passwordHashRounds, dkLen: 32 }));
}

function validateCredentials(username: string, password: string): void {
  if (username.length < 4 || username.length > 64) throw new Error('Choose a username between 4 and 64 characters.');
  if (password.length < 8 || password.length > 128) throw new Error('Choose a password between 8 and 128 characters.');
}

export function normalizeLocalUsername(username: string): string {
  return username.trim().toLowerCase();
}

function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
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

function isConstraintError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'ConstraintError';
}
