import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import type { AuthIdentity, AuthSession } from './src/auth/contracts';
import { createGoogleBooksCatalog } from './src/catalog/googleBooksCatalog';
import { AppFlow } from './src/features/account/AppFlow';
import {
  createEmptyLocalRepositories,
  createLocalAuthActions,
  initializeLocalDatabase,
  loadLocalRepositories,
  restoreLocalSession,
} from './src/data/local/localDatabase';
import type { LocalRepositories } from './src/data/local/localRepositories';
import { journalColors as colors } from './src/theme/colors';

export default function App() {
  return (
    <SQLiteProvider databaseName="leafmark.db" onInit={initializeLocalDatabase}>
      <LocalApp />
    </SQLiteProvider>
  );
}

function LocalApp() {
  const database = useSQLiteContext();
  const [session, setSession] = useState<AuthSession>({ isLoaded: false, identity: null });
  const [repositories, setRepositories] = useState<LocalRepositories | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  const activateAccount = useCallback(async (identity: AuthIdentity | null) => {
    if (identity) {
      setRepositories(await loadLocalRepositories(database, identity));
    } else {
      setRepositories(null);
    }
    setSession({ isLoaded: true, identity });
  }, [database]);

  useEffect(() => {
    let isCurrent = true;
    void restoreLocalSession(database).then(async (identity) => {
      if (!isCurrent) return;
      if (identity) {
        const loadedRepositories = await loadLocalRepositories(database, identity);
        if (isCurrent) setRepositories(loadedRepositories);
      }
      if (isCurrent) setSession({ isLoaded: true, identity });
    }).catch(() => {
      if (!isCurrent) return;
      setStartupError('Leafmark could not open its local database on this iPad. Restart the app and try again.');
      setSession({ isLoaded: true, identity: null });
    });

    return () => {
      isCurrent = false;
    };
  }, [database]);

  const auth = useMemo(() => createLocalAuthActions(database, activateAccount), [activateAccount, database]);
  const catalog = useMemo(() => createGoogleBooksCatalog(), []);
  const emptyRepositories = useMemo(
    () => createEmptyLocalRepositories('signed-out'),
    [],
  );

  if (startupError) {
    return (
      <View style={styles.startupScreen}>
        <Text style={styles.kicker}>LEAFMARK</Text>
        <Text style={styles.startupTitle}>Your journal needs attention.</Text>
        <Text accessibilityRole="alert" style={styles.startupMessage}>{startupError}</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <>
      <AppFlow
        auth={auth}
        session={session}
        profiles={repositories?.profiles ?? emptyRepositories.profiles}
        catalog={catalog}
        tbr={repositories?.tbr ?? emptyRepositories.tbr}
        reading={repositories?.reading ?? emptyRepositories.reading}
        bookPages={repositories?.bookPages ?? emptyRepositories.bookPages}
        bookshelf={repositories?.bookshelf ?? emptyRepositories.bookshelf}
      />
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  startupScreen: { alignItems: 'center', backgroundColor: colors.paper, flex: 1, justifyContent: 'center', padding: 32 },
  kicker: { color: colors.olive, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  startupTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 30, marginTop: 16, textAlign: 'center' },
  startupMessage: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 14, maxWidth: 440, textAlign: 'center' },
});
