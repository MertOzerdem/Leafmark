import React, { type ReactNode, useCallback, useEffect, useState } from 'react';
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
import type { BookPageRepository } from '../../books/bookPageTypes';
import type { BookshelfRepository } from '../../books/bookshelfTypes';
import type { ReadingRepository } from '../../reading/readingTypes';
import { journalColors as colors } from '../../theme/colors';
import { ReadBooksLibrary } from '../books/ReadBooksLibrary';
import { TbrScreen } from '../books/TbrScreen';
import { ReadingTrackerScreen } from '../reading/ReadingTrackerScreen';
import { BookshelfScreen } from '../books/BookshelfScreen';
import { JournalAccents } from './JournalAccents';

interface AppFlowProps {
  auth: AuthActions;
  session: AuthSession;
  profiles: ReaderProfileRepository;
  catalog: BookCatalog;
  tbr: TbrRepository;
  reading: ReadingRepository;
  bookPages: BookPageRepository;
  bookshelf: BookshelfRepository;
  backupControls?: ReactNode;
  storageStatus?: string;
}

type AppSection = 'bookshelf' | 'tracker' | 'read-books' | 'tbr';

export function AppFlow({
  auth,
  session,
  profiles,
  catalog,
  tbr,
  reading,
  bookPages,
  bookshelf,
  backupControls,
  storageStatus,
}: AppFlowProps) {
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [collectionRevision, setCollectionRevision] = useState(0);
  const [activeSection, setActiveSection] = useState<AppSection>('bookshelf');

  const onReadingChanged = useCallback(() => {
    setCollectionRevision((revision) => revision + 1);
  }, []);

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
    if ((isCreatingAccount && password.length < 8) || !password) {
      setFormError(isCreatingAccount ? 'Choose a password with at least 8 characters.' : 'Enter your password.');
      return;
    }
    if (password.length > 128) {
      setFormError('Passwords must be no longer than 128 characters.');
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
        setIsCreatingAccount(false);
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
            <Text style={styles.kicker}>LEAFMARK · LOCAL READING JOURNAL</Text>
            <Text accessibilityRole="header" style={styles.title}>Your reading life, gathered in one place.</Text>
            <Text style={styles.intro}>
              Create an account on this iPad or sign in to keep each reader’s books and notes separate in Leafmark’s local database.
            </Text>
            {storageStatus ? (
              <>
                <View style={styles.installNote}>
                  <Text style={styles.installTitle}>Made for your Home Screen</Text>
                  <Text style={styles.installText}>Open Leafmark in Safari, tap Share, then choose Add to Home Screen.</Text>
                </View>
                <Text style={styles.privacyNote}>Connect to the internet for the first visit and app updates.</Text>
                <Text style={styles.privacyNote}>Your journal opens offline after the first visit.</Text>
              </>
            ) : null}

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

            <Text style={styles.privacyNote}>
              This account is saved only on this iPad. Leafmark does not sync it to another device.
            </Text>
            {backupControls}
            {storageStatus ? (
              <Text accessibilityLiveRegion="polite" style={styles.privacyNote} testID="storage-status">
                {storageStatus}
              </Text>
            ) : null}
            <Text style={styles.privacyNote}>There is no password recovery. Keep your password safe.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      <JournalAccents />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <View style={styles.appHeader}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>LEAFMARK · LOCAL READING JOURNAL</Text>
            <Text style={styles.headerTitle}>Welcome back, {identity.username}.</Text>
            <Text style={styles.headerSubtitle}>Local account on this iPad · {identity.username}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIsCreatingAccount(false);
              void auth.signOut().catch((error: unknown) => setProfileError(getReadableError(error)));
            }}
            style={styles.headerSignOut}
          >
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.mainContent} contentContainerStyle={styles.privateShell} keyboardShouldPersistTaps="handled">

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
              <Text style={styles.profileTitle}>Your local shelf</Text>
              <Text style={styles.profileLabel}>{profile.privateLabel}</Text>
              <Text style={styles.profileHint}>Your books, notes, and layout are saved on this iPad and are not synced.</Text>
              {storageStatus ? (
                <Text accessibilityLiveRegion="polite" style={styles.profileHint} testID="storage-status">
                  {storageStatus}
                </Text>
              ) : null}
              {backupControls}
            </View>
          ) : null}

          {activeSection === 'bookshelf' ? <BookshelfScreen refreshToken={collectionRevision} repository={bookshelf} /> : null}
          {activeSection === 'tracker' ? <ReadingTrackerScreen onBookFinished={onReadingChanged} refreshToken={collectionRevision} repository={reading} /> : null}
          {activeSection === 'read-books' ? <ReadBooksLibrary onReadingChanged={onReadingChanged} ownerSubject={subject ?? ''} pages={bookPages} refreshToken={collectionRevision} repository={reading} /> : null}
          {activeSection === 'tbr' ? <TbrScreen catalog={catalog} onBooksChanged={onReadingChanged} refreshToken={collectionRevision} repository={tbr} /> : null}
        </ScrollView>
        <View accessibilityLabel="Main navigation" style={styles.tabBar}>
          {([
            ['bookshelf', 'Bookshelf', 'Open My Bookshelf'],
            ['tracker', 'Reading Log', 'Open Reading tracker'],
            ['read-books', 'Read Books', 'Open Read Books'],
            ['tbr', 'To Be Read', 'Open TBR'],
          ] as const).map(([section, label, accessibilityLabel]) => (
            <Pressable
              key={section}
              accessibilityRole="button"
              accessibilityState={{ selected: activeSection === section }}
              accessibilityLabel={accessibilityLabel}
              onPress={() => setActiveSection(section)}
              style={[styles.tabButton, activeSection === section && styles.activeTab]}
            >
              <Text style={[styles.tabText, activeSection === section && styles.activeTabText]}>{label}</Text>
            </Pressable>
          ))}
        </View>
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
  installNote: { backgroundColor: '#F2EFDF', borderRadius: 18, marginTop: 28, padding: 18 },
  installTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 18 },
  installText: { color: colors.ink, fontSize: 14, lineHeight: 21, marginTop: 7 },
  error: { color: colors.error, fontSize: 14, lineHeight: 20, marginTop: 14 },
  centeredScreen: { alignItems: 'center', backgroundColor: colors.paper, flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.muted, fontSize: 14, marginTop: 12 },
  privateShell: { alignSelf: 'center', flexGrow: 1, justifyContent: 'flex-start', maxWidth: 1000, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 16, width: '100%' },
  mainContent: { flex: 1 },
  appHeader: { alignItems: 'center', backgroundColor: '#F7F5EBE8', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 16, justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 12 },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 23, marginTop: 6 },
  headerSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  headerSignOut: { alignItems: 'center', borderColor: colors.line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 12 },
  tabBar: { alignItems: 'center', backgroundColor: colors.panel, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: 4, justifyContent: 'space-around', paddingHorizontal: 8, paddingVertical: 8 },
  tabButton: { alignItems: 'center', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 6 },
  activeTab: { backgroundColor: '#E9E8DA' },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  activeTabText: { color: colors.ink },
  profileLoading: { alignItems: 'center', marginVertical: 30 },
  profileCard: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 20, borderWidth: 1, marginVertical: 30, padding: 24 },
  profileTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 24 },
  profileLabel: { color: colors.olive, fontSize: 17, fontWeight: '600', marginTop: 16 },
  profileHint: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.olive, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 48, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
});
