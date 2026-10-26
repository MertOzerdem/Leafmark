import type { LocalBookStore } from './localRepositories';

const backupFormat = 'leafmark-local-backup';
const backupVersion = 1;

interface LocalAccountRecord {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface SerializedLocalBookStore extends Omit<LocalBookStore, 'values'> {
  values: Array<[string, string]>;
}

interface LocalWorkspaceRecord {
  accountId: string;
  stateJson: string;
  updatedAt: string;
}

export interface LocalBackupDocument {
  format: typeof backupFormat;
  version: typeof backupVersion;
  createdAt: string;
  profiles: LocalAccountRecord[];
  workspaces: Array<{
    accountId: string;
    updatedAt: string;
    state: SerializedLocalBookStore;
  }>;
}

export interface LocalBackupExport {
  fileName: string;
  content: string;
}

export type LocalBackupRestoreResult = 'restored' | 'cancelled';

export interface LocalBackupRepository {
  createExport(): Promise<LocalBackupExport>;
  restore(content: string, confirmReplacement: () => Promise<boolean>): Promise<LocalBackupRestoreResult>;
}

export function createLocalBackupRepository(database: IDBDatabase): LocalBackupRepository {
  return {
    async createExport() {
      const { accounts, workspaces } = await readProfilesAndWorkspaces(database);
      if (accounts.length === 0) throw new Error('There are no local profiles to back up yet.');

      const workspacesByAccount = new Map(workspaces.map((workspace) => [workspace.accountId, workspace]));
      const document: LocalBackupDocument = {
        format: backupFormat,
        version: backupVersion,
        createdAt: new Date().toISOString(),
        profiles: accounts,
        workspaces: accounts.map((account) => {
          const workspace = workspacesByAccount.get(account.id);
          if (!workspace) throw new Error('A local profile is missing its journal data. This backup was not created.');
          return {
            accountId: workspace.accountId,
            updatedAt: workspace.updatedAt,
            state: parseLocalState(workspace.stateJson),
          };
        }),
      };

      return {
        fileName: `leafmark-backup-${document.createdAt.slice(0, 10)}.json`,
        content: JSON.stringify(document),
      };
    },

    async restore(content, confirmReplacement) {
      const decoded = decodeLocalBackup(content);
      const currentAccounts = await getAll<LocalAccountRecord>(database, 'accounts');
      if (currentAccounts.length > 0 && !(await confirmReplacement())) return 'cancelled';

      const transaction = database.transaction(['accounts', 'workspaces', 'sessions'], 'readwrite');
      const committed = transactionComplete(transaction);
      const accountStore = transaction.objectStore('accounts');
      const workspaceStore = transaction.objectStore('workspaces');
      transaction.objectStore('sessions').clear();
      accountStore.clear();
      workspaceStore.clear();

      for (const profile of decoded.profiles) accountStore.put(profile);
      for (const workspace of decoded.workspaces) {
        workspaceStore.put({
          accountId: workspace.accountId,
          stateJson: JSON.stringify(workspace.state),
          updatedAt: workspace.updatedAt,
        } satisfies LocalWorkspaceRecord);
      }

      try {
        await committed;
      } catch {
        throw new Error('The backup could not be restored. Your existing local data is unchanged.');
      }
      return 'restored';
    },
  };
}

export function decodeLocalBackup(content: string): LocalBackupDocument {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new Error('This file is not a valid Leafmark backup.');
  }

  if (!isRecord(value) || value.format !== backupFormat) {
    throw new Error('This file is not a valid Leafmark backup.');
  }
  if (value.version !== backupVersion) {
    throw new Error(`This backup uses an unsupported format version${typeof value.version === 'number' ? ` (${value.version})` : ''}.`);
  }
  if (!isTimestamp(value.createdAt) || !Array.isArray(value.profiles) || value.profiles.length === 0 || !Array.isArray(value.workspaces)) {
    throw damagedBackupError();
  }

  const profiles = value.profiles.map(decodeProfile);
  const profileIds = new Set<string>();
  const usernames = new Set<string>();
  for (const profile of profiles) {
    if (profileIds.has(profile.id) || usernames.has(profile.normalizedUsername)) throw damagedBackupError();
    profileIds.add(profile.id);
    usernames.add(profile.normalizedUsername);
  }

  const workspaces = value.workspaces.map(decodeWorkspace);
  const workspaceIds = new Set<string>();
  for (const workspace of workspaces) {
    if (!profileIds.has(workspace.accountId) || workspaceIds.has(workspace.accountId)) throw damagedBackupError();
    workspaceIds.add(workspace.accountId);
  }
  if (workspaceIds.size !== profileIds.size) throw damagedBackupError();

  return {
    format: backupFormat,
    version: backupVersion,
    createdAt: value.createdAt,
    profiles,
    workspaces,
  };
}

async function readProfilesAndWorkspaces(database: IDBDatabase): Promise<{ accounts: LocalAccountRecord[]; workspaces: LocalWorkspaceRecord[] }> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['accounts', 'workspaces'], 'readonly');
    const accountRequest = transaction.objectStore('accounts').getAll();
    const workspaceRequest = transaction.objectStore('workspaces').getAll();
    transaction.oncomplete = () => resolve({
      accounts: accountRequest.result as LocalAccountRecord[],
      workspaces: workspaceRequest.result as LocalWorkspaceRecord[],
    });
    transaction.onerror = () => reject(transaction.error ?? new Error('Leafmark could not read local profiles for backup.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Leafmark could not read local profiles for backup.'));
  });
}

function getAll<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('Leafmark could not read local profiles.'));
  });
}

function parseLocalState(stateJson: string): SerializedLocalBookStore {
  try {
    return decodeLocalState(JSON.parse(stateJson) as unknown);
  } catch (error) {
    if (error instanceof Error && error.message === damagedBackupError().message) {
      throw new Error('A local profile has incomplete journal data. This backup was not created.');
    }
    throw new Error('A local profile has unreadable journal data. This backup was not created.');
  }
}

function decodeProfile(value: unknown): LocalAccountRecord {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.username)
    || !isNonEmptyString(value.normalizedUsername)
    || !/^[a-f0-9]{32}$/i.test(asString(value.passwordSalt))
    || !/^[a-f0-9]{64}$/i.test(asString(value.passwordHash))
    || !isTimestamp(value.createdAt)) {
    throw damagedBackupError();
  }

  return {
    id: value.id,
    username: value.username,
    // Keep the saved key intact because older device locales could allow distinct
    // usernames that collide under today's locale-independent normalization.
    normalizedUsername: value.normalizedUsername,
    passwordSalt: value.passwordSalt as string,
    passwordHash: value.passwordHash as string,
    createdAt: value.createdAt,
  };
}

function decodeWorkspace(value: unknown): LocalBackupDocument['workspaces'][number] {
  if (!isRecord(value) || !isNonEmptyString(value.accountId) || !isTimestamp(value.updatedAt)) throw damagedBackupError();
  return {
    accountId: value.accountId,
    updatedAt: value.updatedAt,
    state: decodeLocalState(value.state),
  };
}

function decodeLocalState(value: unknown): SerializedLocalBookStore {
  if (!isRecord(value)
    || !Array.isArray(value.books)
    || !value.books.every(isBook)
    || !isStringArray(value.tbrBookIds)
    || !isStringRecord(value.categoryColors)
    || !isStringArray(value.shelfBookIds)
    || !Array.isArray(value.decorations)
    || !value.decorations.every(isDecoration)
    || !isOrientationRecord(value.orientations)
    || !isStringRecord(value.spineColors)
    || !isBooleanRecord(value.customizedSpineColors)
    || !isPositionRecord(value.positions)
    || !Array.isArray(value.configurations)
    || !value.configurations.every(isConfiguration)
    || !Array.isArray(value.attempts)
    || !value.attempts.every(isAttempt)
    || !Array.isArray(value.logs)
    || !value.logs.every(isLog)
    || !Array.isArray(value.fields)
    || !value.fields.every(isField)
    || !Array.isArray(value.values)
    || !value.values.every(isValueEntry)
    || !Number.isSafeInteger(value.nextId)
    || (value.nextId as number) < 1) {
    throw damagedBackupError();
  }

  const books = value.books as Array<{ id: string }>;
  const bookIds = new Set(books.map((book) => book.id));
  const tbrBookIds = value.tbrBookIds as string[];
  const shelfBookIds = value.shelfBookIds as string[];
  const attempts = value.attempts as Array<{ id: string; bookId: string }>;
  const configurations = value.configurations as Array<{
    id: string;
    measure: string;
    categories: Array<{ position: number }>;
  }>;
  const logs = value.logs as Array<{
    id: string;
    attemptId: string;
    bookId: string;
    configurationId: string;
    measure: string;
    categoryPosition: number;
  }>;
  const fields = value.fields as Array<{ id: string; bookId: string | null }>;
  const values = value.values as Array<[string, string]>;
  const attemptIds = new Set(attempts.map((attempt) => attempt.id));
  const configurationIds = new Set(configurations.map((configuration) => configuration.id));
  const fieldIds = new Set(fields.map((field) => field.id));

  if (bookIds.size !== books.length
    || !hasUniqueValues(tbrBookIds)
    || !hasUniqueValues(shelfBookIds)
    || tbrBookIds.some((id) => !bookIds.has(id))
    || shelfBookIds.some((id) => !bookIds.has(id))
    || attemptIds.size !== attempts.length
    || attempts.some((attempt) => !bookIds.has(attempt.bookId))
    || configurationIds.size !== configurations.length
    || configurations.some((configuration) => !hasUniqueValues(configuration.categories.map((category) => category.position)))
    || logs.some((log) => {
      const attempt = attempts.find((entry) => entry.id === log.attemptId);
      const configuration = configurations.find((entry) => entry.id === log.configurationId);
      return !attempt
        || attempt.bookId !== log.bookId
        || !bookIds.has(log.bookId)
        || !configuration
        || configuration.measure !== log.measure
        || !configuration.categories.some((category) => category.position === log.categoryPosition);
    })
    || fields.some((field) => field.bookId !== null && !bookIds.has(field.bookId))
    || fieldIds.size !== fields.length
    || values.some(([key]) => !valueReferencesFieldForBook(key, bookIds, fieldIds, fields))) {
    throw damagedBackupError();
  }

  return value as unknown as SerializedLocalBookStore;
}

function isBook(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.title)
    && isStringArray(value.authors)
    && isNullableString(value.googleVolumeId)
    && isNullableString(value.coverUrl)
    && isStringArray(value.categories)
    && (value.pageCount === null || (typeof value.pageCount === 'number' && Number.isFinite(value.pageCount) && value.pageCount > 0))
    && isNullableString(value.description);
}

function isDecoration(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && (value.kind === 'plant' || value.kind === 'frame')
    && isNormalizedPosition(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y)
    && value.y >= 0;
}

function isConfiguration(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && (value.measure === 'minutes' || value.measure === 'pages' || value.measure === 'chapters')
    && isDate(value.startsOn)
    && Array.isArray(value.categories)
    && value.categories.every((category: unknown) => isRecord(category)
      && Number.isSafeInteger(category.position)
      && typeof category.minimum === 'number'
      && Number.isFinite(category.minimum)
      && (category.maximum === null || (typeof category.maximum === 'number' && Number.isFinite(category.maximum)))
      && /^#[\da-f]{6}$/i.test(asString(category.color)));
}

function isAttempt(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.bookId)
    && isNonEmptyString(value.bookTitle)
    && isDate(value.startedOn)
    && (value.finishedOn === null || isDate(value.finishedOn))
    && (value.rating === null || (typeof value.rating === 'number' && value.rating >= 1 && value.rating <= 5 && Number.isInteger(value.rating * 2)))
    && typeof value.reflection === 'string'
    && typeof value.isCurrent === 'boolean';
}

function isLog(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.attemptId)
    && isNonEmptyString(value.bookId)
    && isNonEmptyString(value.bookTitle)
    && isNonEmptyString(value.configurationId)
    && isDate(value.date)
    && typeof value.amount === 'number'
    && Number.isFinite(value.amount)
    && value.amount > 0
    && (value.measure === 'minutes' || value.measure === 'pages' || value.measure === 'chapters')
    && Number.isSafeInteger(value.categoryPosition);
}

function isField(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && (value.bookId === null || isNonEmptyString(value.bookId))
    && isNonEmptyString(value.label)
    && (value.type === 'text' || value.type === 'multiline' || value.type === 'list' || value.type === 'image')
    && Number.isSafeInteger(value.position)
    && typeof value.isTemplate === 'boolean';
}

function isValueEntry(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string';
}

function isOrientationRecord(value: unknown): value is Record<string, 'upright' | 'tilted' | 'horizontal'> {
  return isRecord(value) && Object.values(value).every((orientation) => orientation === 'upright' || orientation === 'tilted' || orientation === 'horizontal');
}

function isPositionRecord(value: unknown): value is Record<string, { x: number; y: number }> {
  return isRecord(value) && Object.values(value).every((position) => isRecord(position)
    && isNormalizedPosition(position.x)
    && typeof position.y === 'number'
    && Number.isFinite(position.y)
    && position.y >= 0);
}

function hasUniqueValues(values: Array<string | number>): boolean {
  return new Set(values).size === values.length;
}

function valueReferencesFieldForBook(
  key: string,
  bookIds: Set<string>,
  fieldIds: Set<string>,
  fields: Array<{ id: string; bookId: string | null }>,
): boolean {
  for (const bookId of bookIds) {
    const prefix = `${bookId}:`;
    if (!key.startsWith(prefix)) continue;
    const fieldId = key.slice(prefix.length);
    const field = fields.find((entry) => entry.id === fieldId);
    return fieldIds.has(fieldId) && Boolean(field) && (field?.bookId === null || field?.bookId === bookId);
  }
  return false;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function isNormalizedPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function damagedBackupError(): Error {
  return new Error('This backup appears damaged or incomplete.');
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('The local change could not be saved.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('The local change could not be saved.'));
  });
}
