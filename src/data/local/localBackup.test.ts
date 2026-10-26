import { decodeLocalBackup } from './localBackup';

const profile = {
  id: 'profile-1',
  username: 'Reader-Ivy',
  normalizedUsername: 'reader-ivy',
  passwordSalt: 'a'.repeat(32),
  passwordHash: 'b'.repeat(64),
  createdAt: '2027-01-01T00:00:00.000Z',
};

const workspace = {
  accountId: 'profile-1',
  updatedAt: '2027-01-02T00:00:00.000Z',
  state: {
    books: [{
      id: 'book-1',
      googleVolumeId: null,
      title: 'The Garden Notebook',
      authors: ['A. Reader'],
      coverUrl: null,
      categories: ['Fiction'],
      pageCount: 240,
      description: null,
    }],
    tbrBookIds: ['book-1'],
    categoryColors: {},
    shelfBookIds: [],
    decorations: [],
    orientations: {},
    spineColors: {},
    customizedSpineColors: {},
    positions: {},
    configurations: [],
    attempts: [],
    logs: [],
    fields: [{ id: 'field-image', bookId: 'book-1', label: 'Illustration', type: 'image', position: 0, isTemplate: false }],
    values: [['book-1:field-image', 'data:image/png;base64,aGVsbG8=']],
    nextId: 2,
  },
};

function backup(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'leafmark-local-backup',
    version: 1,
    createdAt: '2027-01-03T00:00:00.000Z',
    profiles: [profile],
    workspaces: [workspace],
    ...overrides,
  });
}

describe('Leafmark local backup format', () => {
  it('accepts a complete backup and keeps all private workspace values intact', () => {
    const decoded = decodeLocalBackup(backup());

    expect(decoded.profiles).toEqual([profile]);
    expect(decoded.workspaces[0]?.state).toEqual(workspace.state);
    expect(decoded.workspaces[0]?.state.values).toContainEqual(['book-1:field-image', 'data:image/png;base64,aGVsbG8=']);
  });

  it('preserves distinct username keys created under a locale-specific normalization rule', () => {
    const turkishLocaleProfile = { ...profile, normalizedUsername: 'reader-ıvy' };
    const secondProfile = { ...profile, id: 'profile-2', username: 'reader-ivy', normalizedUsername: 'reader-ivy' };
    const secondWorkspace = { ...workspace, accountId: 'profile-2' };

    const decoded = decodeLocalBackup(backup({ profiles: [turkishLocaleProfile, secondProfile], workspaces: [workspace, secondWorkspace] }));

    expect(decoded.profiles.map(({ normalizedUsername }) => normalizedUsername)).toEqual(['reader-ıvy', 'reader-ivy']);
    expect(decoded.profiles.map(({ username }) => username)).toEqual(['Reader-Ivy', 'reader-ivy']);
  });

  it('rejects a backup version the app cannot restore', () => {
    expect(() => decodeLocalBackup(backup({ version: 2 }))).toThrow('This backup uses an unsupported format version');
  });

  it('rejects damaged workspace data before it can be applied', () => {
    const damaged = { ...workspace, state: { ...workspace.state, values: [['book-1:image']] } };
    expect(() => decodeLocalBackup(backup({ workspaces: [damaged] }))).toThrow('This backup appears damaged or incomplete');
  });

  it('rejects a backup that omits a profile workspace', () => {
    expect(() => decodeLocalBackup(backup({ workspaces: [] }))).toThrow('This backup appears damaged or incomplete');
  });

  it.each([
    ['attempts that reference an unknown Book', { attempts: [{
      id: 'attempt-1', bookId: 'missing-book', bookTitle: 'Missing', startedOn: '2027-01-01', finishedOn: null,
      rating: null, reflection: '', isCurrent: true,
    }] }],
    ['logs that reference an unknown attempt', { logs: [{
      id: 'log-1', attemptId: 'missing-attempt', bookId: 'book-1', bookTitle: 'The Garden Notebook',
      configurationId: 'configuration-1', date: '2027-01-02', amount: 12, measure: 'pages', categoryPosition: 0,
    }] }],
    ['logs that reference an unknown reading category', {
      configurations: [{ id: 'configuration-1', measure: 'pages', startsOn: '2027-01-01', categories: [{ position: 0, minimum: 1, maximum: null, color: '#82876A' }] }],
      attempts: [{
        id: 'attempt-1', bookId: 'book-1', bookTitle: 'The Garden Notebook', startedOn: '2027-01-01', finishedOn: null,
        rating: null, reflection: '', isCurrent: true,
      }],
      logs: [{
        id: 'log-1', attemptId: 'attempt-1', bookId: 'book-1', bookTitle: 'The Garden Notebook',
        configurationId: 'configuration-1', date: '2027-01-02', amount: 12, measure: 'pages', categoryPosition: 9,
      }],
    }],
    ['Book page values that reference an unknown field', { values: [['book-1:missing-field', 'orphaned value']] }],
  ])('rejects %s', (_description, stateChanges) => {
    const damagedWorkspace = { ...workspace, state: { ...workspace.state, ...stateChanges } };

    expect(() => decodeLocalBackup(backup({ workspaces: [damagedWorkspace] }))).toThrow('This backup appears damaged or incomplete');
  });
});
