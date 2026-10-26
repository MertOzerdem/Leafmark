import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import type { AuthActions, AuthIdentity, AuthSession } from './src/auth/contracts';
import { createGoogleBooksCatalog } from './src/catalog/googleBooksCatalog';
import {
  createIndexedLocalAuthActions,
  loadIndexedLocalRepositories,
  openLocalIndexedDatabase,
  persistentStorageMessage,
  requestPersistentStorage,
  restoreLocalIndexedSession,
} from './src/data/local/localIndexedDatabase';
import { createEmptyLocalBookStore, createLocalRepositories, type LocalRepositories } from './src/data/local/localRepositories';
import { AppFlow } from './src/features/account/AppFlow';
import { journalColors as colors } from './src/theme/colors';
import type { PersistentStorageStatus } from './src/data/local/localIndexedDatabase';

const unavailableAuth: AuthActions = {
  async signIn() { throw new Error('The local journal is still opening. Try again.'); },
  async signUp() { throw new Error('The local journal is still opening. Try again.'); },
  async signOut() { throw new Error('The local journal is still opening. Try again.'); },
};

export default function App() {
  const [database, setDatabase] = useState<IDBDatabase | null>(null);
  const [session, setSession] = useState<AuthSession>({ isLoaded: false, identity: null });
  const [repositories, setRepositories] = useState<LocalRepositories | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<PersistentStorageStatus>('checking');

  useEffect(() => {
    let isCurrent = true;

    void openLocalIndexedDatabase().then(async (openedDatabase) => {
      const identity = await restoreLocalIndexedSession(openedDatabase);
      const loadedRepositories = identity
        ? await loadIndexedLocalRepositories(openedDatabase, identity)
        : null;

      if (!isCurrent) {
        openedDatabase.close();
        return;
      }

      setDatabase(openedDatabase);
      setRepositories(loadedRepositories);
      setSession({ isLoaded: true, identity });
    }).catch(() => {
      if (isCurrent) setStartupError('Leafmark could not open this iPad’s local journal. Reload the page and try again.');
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const isHomeScreenApp = isStandalonePwa();
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;

    void requestPersistentStorage(isHomeScreenApp, storage).then((status) => {
      if (isCurrent) setStorageStatus(status);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const activateAccount = useCallback(async (identity: AuthIdentity | null) => {
    if (identity && database) {
      setRepositories(await loadIndexedLocalRepositories(database, identity));
    } else {
      setRepositories(null);
    }
    setSession({ isLoaded: true, identity });
  }, [database]);

  const auth = useMemo(
    () => database ? createIndexedLocalAuthActions(database, activateAccount) : unavailableAuth,
    [activateAccount, database],
  );
  const emptyRepositories = useMemo(
    () => createLocalRepositories(createEmptyLocalBookStore(), 'signed-out', async () => undefined),
    [],
  );
  const catalog = useMemo(() => createGoogleBooksCatalog(), []);

  if (startupError) {
    return (
      <View style={styles.startupScreen}>
        <Text style={styles.kicker}>LEAFMARK · LOCAL READING JOURNAL</Text>
        <Text style={styles.startupTitle}>Your journal needs attention.</Text>
        <Text accessibilityRole="alert" style={styles.startupMessage}>{startupError}</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <AppFlow
        auth={auth}
        session={session}
        profiles={repositories?.profiles ?? emptyRepositories.profiles}
        catalog={catalog}
        tbr={repositories?.tbr ?? emptyRepositories.tbr}
        reading={repositories?.reading ?? emptyRepositories.reading}
        bookPages={repositories?.bookPages ?? emptyRepositories.bookPages}
        bookshelf={repositories?.bookshelf ?? emptyRepositories.bookshelf}
        storageStatus={persistentStorageMessage(storageStatus)}
      />
      <StatusBar style="dark" />
    </View>
  );
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

const styles = StyleSheet.create({
  app: { backgroundColor: colors.paper, flex: 1, minHeight: '100%' },
  startupScreen: { alignItems: 'center', backgroundColor: colors.paper, flex: 1, justifyContent: 'center', minHeight: '100%', padding: 32 },
  kicker: { color: colors.olive, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  startupTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 30, marginTop: 16, textAlign: 'center' },
  startupMessage: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 14, maxWidth: 440, textAlign: 'center' },
});
