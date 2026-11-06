import React, { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { BookPageSaveButton, type BookPageSaveStatus } from '../books/BookPage';
import { TbrScreen } from '../books/TbrScreen';
import { ReadingTrackerScreen } from '../reading/ReadingTrackerScreen';
import { BookshelfScreen } from '../books/BookshelfScreen';
import { BookPageTemplateEditor } from '../books/BookPageTemplateEditor';
import { TbrCategorySettings } from '../books/TbrScreen';
import { JournalAccents } from './JournalAccents';
import { pickBookImage } from '../books/pickBookImage';

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

type AppSection = 'bookshelf' | 'tracker' | 'read-books' | 'tbr' | 'profile' | 'settings';

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
  const [settingsView, setSettingsView] = useState<'home' | 'book-page' | 'reading' | 'categories'>('home');
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const mainScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const bookPageSaveActionRef = useRef<() => void>(() => undefined);
  const [bookPageSaveStatus, setBookPageSaveStatus] = useState<BookPageSaveStatus | null>(null);

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

  async function chooseProfilePhoto() {
    if (!profile || isSavingAvatar) return;
    try {
      const photo = await pickBookImage();
      if (!photo) return;
      setIsSavingAvatar(true);
      await profiles.saveAvatar(profile.subject, photo);
      setProfile((current) => current ? { ...current, avatarDataUrl: photo } : current);
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'The profile photo could not be saved. Try again.');
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function removeProfilePhoto() {
    if (!profile?.avatarDataUrl || isSavingAvatar) return;
    setIsSavingAvatar(true);
    try {
      await profiles.saveAvatar(profile.subject, null);
      setProfile((current) => current ? { ...current, avatarDataUrl: null } : current);
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'The profile photo could not be removed. Try again.');
    } finally {
      setIsSavingAvatar(false);
    }
  }

  function openAccountSection(section: 'profile' | 'settings') {
    setIsProfileMenuOpen(false);
    setActiveSection(section);
    if (section === 'settings') setSettingsView('home');
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function signOut() {
    setIsProfileMenuOpen(false);
    setIsCreatingAccount(false);
    void auth.signOut().catch((error: unknown) => setProfileError(getReadableError(error)));
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
            <Text style={styles.privacyNote}>There is no password recovery. Keep your password safe.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      <JournalAccents />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.contentLayer}>
        <View accessibilityLabel="Main navigation" style={styles.navigationBar}>
          <Text accessibilityRole="header" style={styles.brandWordmark}>LEAFMARK</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navigationScroll} contentContainerStyle={styles.navigationItems}>
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
              onPress={() => {
                setActiveSection(section);
                setIsProfileMenuOpen(false);
                mainScrollRef.current?.scrollTo({ y: 0, animated: false });
              }}
              style={[styles.tabButton, activeSection === section && styles.activeTab]}
            >
              <Text style={[styles.tabText, activeSection === section && styles.activeTabText]}>{label}</Text>
            </Pressable>
          ))}
          </ScrollView>
          <View style={styles.profileAnchor}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isProfileMenuOpen ? 'Close profile menu' : 'Open profile menu'}
              accessibilityState={{ expanded: isProfileMenuOpen }}
              onPress={() => setIsProfileMenuOpen((open) => !open)}
              style={styles.headerProfileButton}
            >
              {profile?.avatarDataUrl ? (
                <Image accessibilityLabel={`${identity.username} profile photo`} resizeMode="cover" source={{ uri: profile.avatarDataUrl }} style={styles.headerAvatarImage} />
              ) : (
                <Text style={styles.headerAvatarInitial}>{identity.username.trim().charAt(0).toUpperCase()}</Text>
              )}
            </Pressable>
            {isProfileMenuOpen ? (
              <View accessibilityLabel="Profile menu" style={styles.profileMenu} testID="profile-menu">
                <Pressable accessibilityRole="button" accessibilityLabel="Open Profile" onPress={() => openAccountSection('profile')} style={styles.profileMenuItem}>
                  <Text style={styles.profileMenuText}>Profile</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Open Settings" onPress={() => openAccountSection('settings')} style={styles.profileMenuItem}>
                  <Text style={styles.profileMenuText}>Settings</Text>
                </Pressable>
                <View style={styles.profileMenuDivider} />
                <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={signOut} style={styles.profileMenuItem}>
                  <Text style={styles.profileMenuSignOutText}>Sign out</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        {activeSection === 'bookshelf' ? (
          <View style={styles.bookshelfViewport}>
            <View style={styles.bookshelfShell}>
              <BookshelfScreen refreshToken={collectionRevision} repository={bookshelf} />
            </View>
          </View>
        ) : (
          <ScrollView ref={mainScrollRef} style={styles.mainContent} contentContainerStyle={styles.privateShell} keyboardShouldPersistTaps="handled">
            {activeSection === 'tracker' ? <ReadingTrackerScreen onBookFinished={onReadingChanged} refreshToken={collectionRevision} repository={reading} /> : null}
            {activeSection === 'read-books' ? <ReadBooksLibrary catalog={catalog} onReadingChanged={onReadingChanged} ownerSubject={subject ?? ''} pages={bookPages} refreshToken={collectionRevision} repository={reading} savePageActionRef={bookPageSaveActionRef} onSaveStatusChange={setBookPageSaveStatus} /> : null}
            {activeSection === 'tbr' ? <TbrScreen catalog={catalog} onBooksChanged={onReadingChanged} refreshToken={collectionRevision} repository={tbr} /> : null}
            {activeSection === 'profile' ? (
              <View testID="profile-screen" style={styles.profileScreen}>
                <Text accessibilityRole="header" style={styles.settingsTitle}>Profile</Text>
                <View style={styles.profilePageCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isSavingAvatar ? 'Saving profile photo' : 'Choose profile photo'}
                    disabled={isSavingAvatar || !profile}
                    onPress={() => void chooseProfilePhoto()}
                    style={styles.largeAvatar}
                  >
                    {profile?.avatarDataUrl ? (
                      <Image accessibilityLabel={`${identity.username} profile photo`} resizeMode="cover" source={{ uri: profile.avatarDataUrl }} style={styles.largeAvatarImage} />
                    ) : (
                      <Text style={styles.largeAvatarInitial}>{identity.username.trim().charAt(0).toUpperCase()}</Text>
                    )}
                  </Pressable>
                  <Text style={styles.profilePageName}>{identity.username}</Text>
                  <Pressable accessibilityRole="button" disabled={isSavingAvatar || !profile} onPress={() => void chooseProfilePhoto()} style={[styles.secondaryButton, styles.profilePhotoButton]}>
                    <Text style={styles.secondaryButtonText}>{isSavingAvatar ? 'Saving photo…' : profile?.avatarDataUrl ? 'Change profile photo' : 'Add profile photo'}</Text>
                  </Pressable>
                  {profile?.avatarDataUrl ? (
                    <Pressable accessibilityRole="button" disabled={isSavingAvatar} onPress={() => void removeProfilePhoto()} style={styles.removePhotoButton}>
                      <Text style={styles.removePhotoText}>Remove profile photo</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.profileHint}>Your profile photo is stored only on this device.</Text>
                  {profileError ? <Text accessibilityRole="alert" style={styles.error}>{profileError}</Text> : null}
                </View>
              </View>
            ) : null}
            {activeSection === 'settings' ? (
              <View testID="settings-screen" style={styles.settingsScreen}>
                {settingsView === 'book-page' ? <BookPageTemplateEditor pages={bookPages} onBack={() => setSettingsView('home')} /> : null}
                {settingsView === 'reading' ? <View><Pressable accessibilityRole="button" onPress={() => setSettingsView('home')} style={styles.settingsBackButton}><Text style={styles.secondaryButtonText}>‹ Settings</Text></Pressable><ReadingTrackerScreen view="settings" onBookFinished={onReadingChanged} refreshToken={collectionRevision} repository={reading} /></View> : null}
                {settingsView === 'categories' ? <View><Pressable accessibilityRole="button" onPress={() => setSettingsView('home')} style={styles.settingsBackButton}><Text style={styles.secondaryButtonText}>‹ Settings</Text></Pressable><TbrCategorySettings repository={tbr} onCategoriesChanged={onReadingChanged} /></View> : null}
                {settingsView === 'home' ? <>
                <Text accessibilityRole="header" style={styles.settingsTitle}>Settings</Text>
                <View style={styles.settingsCard}>
                  <Text style={styles.profileLabel}>Personalize your journal</Text>
                  <Text style={styles.profileHint}>Set these once. Reading logs and Book pages use your saved choices.</Text>
                  <Pressable accessibilityRole="button" onPress={() => setSettingsView('book-page')} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Book page template</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setSettingsView('reading')} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Reading measure and colors</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setSettingsView('categories')} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Book category colors</Text>
                  </Pressable>
                </View>
                {isProfileLoading ? (
                  <View style={styles.profileLoading} testID="profile-loading">
                    <ActivityIndicator color={colors.olive} />
                    <Text style={styles.loadingText}>Loading account settings…</Text>
                  </View>
                ) : profileError ? (
                  <View style={styles.settingsCard}>
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
                  <View style={styles.settingsCard}>
                    <Text style={styles.profileLabel}>Local account · {profile.username}</Text>
                    <Text style={styles.profileHint}>Your books, notes, and layout are saved on this iPad and are not synced.</Text>
                    {storageStatus ? (
                      <Text accessibilityLiveRegion="polite" style={styles.profileHint} testID="storage-status">
                        {storageStatus}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {backupControls}
                </> : null}
              </View>
            ) : null}
          </ScrollView>
        )}
        {activeSection === 'read-books' && bookPageSaveStatus ? (
          <BookPageSaveButton status={bookPageSaveStatus} onPress={() => bookPageSaveActionRef.current()} />
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function getReadableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'We could not complete that request. Check your details and try again.';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper, flex: 1, height: '100vh', maxHeight: '100vh', overflow: 'hidden' },
  contentLayer: { flex: 1, minHeight: 0 },
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
  title: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 36, lineHeight: 42, marginTop: 18 },
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
  privateShell: { alignSelf: 'center', flexGrow: 1, justifyContent: 'flex-start', maxWidth: 1000, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 16, width: '100%' },
  mainContent: { flex: 1 },
  bookshelfViewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  bookshelfShell: { alignSelf: 'center', flex: 1, justifyContent: 'flex-start', maxWidth: 1000, minHeight: 0, overflow: 'hidden', paddingHorizontal: 22, paddingBottom: 12, paddingTop: 8, width: '100%' },
  brandWordmark: { color: colors.olive, flexShrink: 0, fontSize: 14, fontWeight: '800', letterSpacing: 1.4 },
  navigationScroll: { flex: 1, minWidth: 0 },
  profileAnchor: { alignItems: 'center', flexShrink: 0, position: 'relative', zIndex: 50 },
  headerProfileButton: { alignItems: 'center', backgroundColor: colors.olive, borderColor: '#FFFCF2', borderRadius: 23, borderWidth: 2, height: 44, justifyContent: 'center', overflow: 'hidden', width: 44 },
  headerAvatarImage: { borderRadius: 24, height: '100%', width: '100%' },
  headerAvatarInitial: { color: colors.panel, fontFamily: 'Baskerville', fontSize: 22, fontWeight: '700' },
  profileMenu: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 14, borderWidth: 1, elevation: 14, padding: 7, position: 'absolute', right: 0, shadowColor: '#403B2B', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.2, shadowRadius: 12, top: 52, width: 190, zIndex: 60 },
  profileMenuItem: { alignItems: 'flex-start', borderRadius: 9, justifyContent: 'center', minHeight: 42, paddingHorizontal: 13 },
  profileMenuText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  profileMenuSignOutText: { color: '#8B3F32', fontSize: 14, fontWeight: '600' },
  profileMenuDivider: { backgroundColor: colors.line, height: StyleSheet.hairlineWidth, marginHorizontal: 8, marginVertical: 4 },
  navigationBar: { alignItems: 'center', backgroundColor: '#F7F5EBE8', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 60, paddingHorizontal: 14, paddingVertical: 6, position: 'relative', zIndex: 30 },
  navigationItems: { alignItems: 'center', flexGrow: 1, gap: 4, justifyContent: 'space-around' },
  tabButton: { alignItems: 'center', borderRadius: 12, flexGrow: 1, justifyContent: 'center', minHeight: 44, minWidth: 94, paddingHorizontal: 8 },
  activeTab: { backgroundColor: '#E9E8DA' },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  activeTabText: { color: colors.ink },
  profileLoading: { alignItems: 'center', marginVertical: 30 },
  profileScreen: { gap: 18 },
  profilePageCard: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 20, borderWidth: 1, padding: 28 },
  profilePhotoButton: { alignSelf: 'center' },
  removePhotoButton: { alignItems: 'center', justifyContent: 'center', marginTop: 12, minHeight: 38, paddingHorizontal: 10 },
  removePhotoText: { color: '#8B3F32', fontSize: 13, fontWeight: '600' },
  largeAvatar: { alignItems: 'center', backgroundColor: '#E9E8DA', borderColor: colors.olive, borderRadius: 70, borderWidth: 2, height: 132, justifyContent: 'center', overflow: 'hidden', width: 132 },
  largeAvatarImage: { borderRadius: 66, height: '100%', width: '100%' },
  largeAvatarInitial: { color: colors.olive, fontFamily: 'Baskerville', fontSize: 58 },
  profilePageName: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 27, marginTop: 16 },
  settingsScreen: { gap: 18 },
  settingsTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 36 },
  settingsBackButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 42, paddingHorizontal: 4 },
  settingsCard: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 20, borderWidth: 1, padding: 24 },
  profileLabel: { color: colors.olive, fontSize: 17, fontWeight: '600', marginTop: 16 },
  profileHint: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.olive, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 48, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
});
