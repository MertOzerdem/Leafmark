import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  AuthActions,
  AuthSession,
  ReaderProfile,
  ReaderProfileRepository,
} from '../../auth/contracts';
import type { BookCatalog, TbrRepository } from '../../books/bookTypes';
import { journalColors as colors } from '../../theme/colors';
import { TbrScreen } from '../books/TbrScreen';
import { JournalAccents } from './JournalAccents';

interface AppFlowProps {
  auth: AuthActions;
  session: AuthSession;
  profiles: ReaderProfileRepository;
  catalog: BookCatalog;
  tbr: TbrRepository;
}

export function AppFlow({ auth, session, profiles, catalog, tbr }: AppFlowProps) {
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const identity = session.identity;
  const subject = identity?.subject ?? null;
  const identityUsername = identity?.username ?? null;

  const loadProfile = useCallback(
    async (activeIdentity: { subject: string; username: string }, isCurrent: () => boolean = () => true) => {
      setIsProfileLoading(true);
      setProfileError(null);

      try {
        const loadedProfile = await profiles.loadOrCreate(activeIdentity);
        if (isCurrent()) setProfile(loadedProfile);
      } catch {
        if (isCurrent()) setProfileError('Your private reading space could not be loaded. Try again.');
      } finally {
        if (isCurrent()) setIsProfileLoading(false);
      }
    },
    [profiles],
  );

  useEffect(() => {
    let isCurrent = true;

    setProfile(null);

    if (!session.isLoaded || !subject || !identityUsername) {
      setIsProfileLoading(false);
      setProfileError(null);
      return () => {
        isCurrent = false;
      };
    }

    const activeIdentity = { subject, username: identityUsername };
    void loadProfile(activeIdentity, () => isCurrent);

    return () => {
      isCurrent = false;
    };
  }, [identityUsername, loadProfile, session.isLoaded, subject]);

  async function submitCredentials() {
    const normalizedUsername = username.trim();
    setFormError(null);

    if (normalizedUsername.length < 4 || normalizedUsername.length > 64) {
      setFormError('Choose a username between 4 and 64 characters.');
      return;
    }
    if (!password) {
      setFormError('Enter your password.');
      return;
    }
    if (isCreatingAccount && password !== confirmation) {
      setFormError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isCreatingAccount) {
        await auth.signUp(normalizedUsername, password);
      } else {
        await auth.signIn(normalizedUsername, password);
      }
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setFormError(getReadableError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.isLoaded) {
    return (
      <View style={styles.centeredScreen} testID="session-loading">
        <ActivityIndicator color={colors.olive} size="large" />
        <Text style={styles.loadingText}>Opening your reading journal…</Text>
      </View>
    );
  }

  if (!identity) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <JournalAccents />
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <View style={styles.authCard}>
            <Text style={styles.kicker}>LEAFMARK · YOUR PRIVATE READING JOURNAL</Text>
            <Text style={styles.title}>Your reading life, gathered in one place.</Text>
            <Text style={styles.intro}>
              Sign in to keep your books, notes, and reading history with you across devices.
            </Text>

            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              onChangeText={setUsername}
              style={styles.input}
              textContentType="username"
              value={username}
              accessibilityLabel="Username"
            />

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              autoCapitalize="none"
              editable={!isSubmitting}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              textContentType={isCreatingAccount ? 'newPassword' : 'password'}
              value={password}
              accessibilityLabel="Password"
            />

            {isCreatingAccount ? (
              <>
                <Text style={styles.fieldLabel}>Confirm password</Text>
                <TextInput
                  autoCapitalize="none"
                  editable={!isSubmitting}
                  onChangeText={setConfirmation}
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  value={confirmation}
                  accessibilityLabel="Confirm password"
                />
              </>
            ) : null}

            {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => void submitCredentials()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedButton]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.panel} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isCreatingAccount ? 'Create account' : 'Sign in'}
                </Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => {
                setFormError(null);
                setIsCreatingAccount((current) => !current);
              }}
              style={styles.modeButton}
            >
              <Text style={styles.modeButtonText}>
                {isCreatingAccount ? 'Already have an account? Sign in' : 'Create account'}
              </Text>
            </Pressable>

            <Text style={styles.privacyNote}>Only your account can open your reading space.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      <JournalAccents />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.privateShell} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>LEAFMARK · PRIVATE READING JOURNAL</Text>
          <Text style={styles.title}>Welcome back, {identity.username}.</Text>
          <Text style={styles.intro}>Signed in as {identity.username}</Text>

          {isProfileLoading ? (
            <View style={styles.profileLoading} testID="profile-loading">
              <ActivityIndicator color={colors.olive} />
              <Text style={styles.loadingText}>Loading your private reading space…</Text>
            </View>
          ) : profileError ? (
            <View style={styles.profileCard}>
              <Text accessibilityRole="alert" style={styles.error}>{profileError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadProfile(identity)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : profile?.subject === subject ? (
            <View style={styles.profileCard}>
              <Text style={styles.profileTitle}>Your private shelf</Text>
              <Text style={styles.profileLabel}>{profile.privateLabel}</Text>
              <Text style={styles.profileHint}>Your account data is protected from other readers.</Text>
            </View>
          ) : null}

          <TbrScreen catalog={catalog} repository={tbr} />

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void auth.signOut().catch((error: unknown) => setProfileError(getReadableError(error)));
            }}
            style={[styles.secondaryButton, styles.signOutButton]}
          >
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function getReadableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'We could not complete that request. Check your details and try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  authCard: {
    alignSelf: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 560,
    padding: 32,
    width: '100%',
  },
  kicker: { color: colors.olive, fontSize: 11, fontWeight: '700', letterSpacing: 1.7 },
  title: { color: colors.ink, fontFamily: 'Georgia', fontSize: 33, lineHeight: 39, marginTop: 18 },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 10 },
  fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 7, marginTop: 21 },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.olive,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 26,
    minHeight: 52,
  },
  pressedButton: { opacity: 0.82 },
  primaryButtonText: { color: colors.panel, fontSize: 16, fontWeight: '700' },
  modeButton: { alignItems: 'center', marginTop: 18, padding: 8 },
  modeButtonText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  privacyNote: { color: colors.muted, fontSize: 12, marginTop: 20, textAlign: 'center' },
  error: { color: colors.error, fontSize: 14, lineHeight: 20, marginTop: 14 },
  centeredScreen: { alignItems: 'center', backgroundColor: colors.paper, flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.muted, fontSize: 14, marginTop: 12 },
  privateShell: { alignSelf: 'center', flexGrow: 1, justifyContent: 'flex-start', maxWidth: 900, padding: 32, width: '100%' },
  profileLoading: { alignItems: 'center', marginVertical: 30 },
  profileCard: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 20, borderWidth: 1, marginVertical: 30, padding: 24 },
  profileTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 24 },
  profileLabel: { color: colors.olive, fontSize: 17, fontWeight: '600', marginTop: 16 },
  profileHint: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.olive, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 48, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  signOutButton: { alignSelf: 'flex-end', marginBottom: 24 },
});
