import React, { useCallback, useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Book, BookDraft } from '../../books/bookTypes';
import type { BookPageField, BookPageFieldType, BookPageRepository, BookPageFieldValue } from '../../books/bookPageTypes';
import { isValidStarRating } from '../../reading/readingTypes';
import type { ReadBook, ReadingAttempt, ReadingRepository } from '../../reading/readingTypes';
import { todayDate, isValidReadingDate } from '../../reading/readingDates';
import { journalColors as colors } from '../../theme/colors';

interface BookPageProps {
  ownerSubject: string;
  readBook: ReadBook;
  repository: ReadingRepository;
  pages: BookPageRepository;
  onBack(): void;
  onReadingChanged(): void;
}

const fieldTypes: Array<{ type: BookPageFieldType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'multiline', label: 'Notes' },
  { type: 'list', label: 'List' },
  { type: 'image', label: 'Image link' },
];

export function BookPage({ onBack, onReadingChanged, ownerSubject, pages, readBook, repository }: BookPageProps) {
  const [fields, setFields] = useState<BookPageField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [imageDisplays, setImageDisplays] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<{ field: BookPageField; before: string | null } | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<BookPageFieldType>('text');
  const [startedOn, setStartedOn] = useState(todayDate());
  const [isStarting, setIsStarting] = useState(false);
  const [isEditingBook, setIsEditingBook] = useState(false);
  const [bookDraft, setBookDraft] = useState<BookDraft>(toBookDraft(readBook.book));
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const currentAttempt = readBook.attempts.find((attempt) => attempt.isCurrent);
  const sortedAttempts = [...readBook.attempts].sort((left, right) =>
    (right.finishedOn ?? right.startedOn).localeCompare(left.finishedOn ?? left.startedOn),
  );

  const loadPage = useCallback(async () => {
    try {
      const [loadedFields, loadedValues] = await Promise.all([
        pages.listFields(readBook.book.id),
        pages.listValues(readBook.book.id),
      ]);
      const valueMap = Object.fromEntries(loadedValues.map((entry: BookPageFieldValue) => [entry.fieldId, entry.value]));
      const displayMap = Object.fromEntries(loadedValues.filter((entry) => entry.displayUrl).map((entry) => [entry.fieldId, entry.displayUrl ?? '']));
      setFields(loadedFields);
      setValues(valueMap);
      setImageDisplays(displayMap);
      setDrafts(Object.fromEntries(loadedFields.map((field) => [field.id, field.type === 'image' ? displayMap[field.id] ?? valueMap[field.id] ?? '' : valueMap[field.id] ?? ''])));
    } catch {
      setMessage('This Book page could not be loaded. Try again.');
    }
  }, [pages, readBook.book.id]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function saveFieldValue(field: BookPageField) {
    const next = drafts[field.id] ?? '';
    const before = values[field.id] ?? null;
    if (field.type === 'image' && next === (imageDisplays[field.id] ?? before ?? '')) return;
    if (field.type !== 'image' && next === (before ?? '')) return;
    try {
      let savedValue = next.trim() ? next : null;
      if (field.type === 'image' && savedValue && !savedValue.startsWith('storage://')) {
        const uploaded = await pages.uploadImage(ownerSubject, readBook.book.id, field.id, savedValue);
        savedValue = uploaded.value;
        setImageDisplays((current) => ({ ...current, [field.id]: uploaded.displayUrl }));
        setDrafts((current) => ({ ...current, [field.id]: uploaded.displayUrl }));
      }
      await pages.saveValue(readBook.book.id, field.id, savedValue);
      setValues((current) => ({ ...current, [field.id]: savedValue ?? '' }));
      if (field.type === 'image' && savedValue === null) setImageDisplays((current) => ({ ...current, [field.id]: '' }));
      setUndo({ field, before });
      setMessage(`${field.label} saved.`);
      onReadingChanged();
    } catch {
      setMessage(`${field.label} could not be saved. Try again.`);
    }
  }

  async function undoLastFieldEdit() {
    if (!undo) return;
    try {
      await pages.saveValue(readBook.book.id, undo.field.id, undo.before);
      const restored = undo.before ?? '';
      await loadPage();
      setValues((current) => ({ ...current, [undo.field.id]: restored }));
      if (undo.field.type !== 'image') setDrafts((current) => ({ ...current, [undo.field.id]: restored }));
      setMessage('Last field edit undone.');
      setUndo(null);
    } catch {
      setMessage('The previous value could not be restored. Try again.');
    }
  }

  async function addBookField() {
    if (!newLabel.trim()) {
      setMessage('Add a name for this Book-only field.');
      return;
    }
    try {
      await pages.addField({
        bookId: readBook.book.id,
        label: newLabel.trim(),
        type: newType,
        position: fields.filter((field) => field.bookId === readBook.book.id).length,
      });
      setNewLabel('');
      await loadPage();
      setMessage('Book-only field added.');
    } catch {
      setMessage('The Book-only field could not be added.');
    }
  }

  async function saveBookDetails() {
    const pageCount = bookDraft.pageCount;
    if (!bookDraft.title.trim() || (pageCount !== null && (!Number.isInteger(pageCount) || pageCount < 1))) {
      setMessage('Add a title and a valid page count.');
      return;
    }
    try {
      await pages.updateBook(readBook.book.id, { ...bookDraft, title: bookDraft.title.trim() });
      setIsEditingBook(false);
      setMessage('Book details saved.');
      onReadingChanged();
    } catch {
      setMessage('Book details could not be saved. Try again.');
    }
  }

  async function startReread() {
    if (currentAttempt || !isValidReadingDate(startedOn)) {
      setMessage(currentAttempt ? 'This Book is already the Current book.' : 'Enter a valid reread start date.');
      return;
    }
    setIsStarting(true);
    try {
      await repository.startReread(readBook.book.id, startedOn);
      onReadingChanged();
      setMessage('A new Reading attempt has started.');
    } catch {
      setMessage('A new Reading attempt could not be started. Try again.');
    } finally {
      setIsStarting(false);
    }
  }

  async function saveReflection(attempt: ReadingAttempt, reflection: string) {
    try {
      await repository.updateAttemptReflection(attempt.id, reflection);
      setMessage('Reading reflection saved.');
      onReadingChanged();
    } catch {
      setMessage('Reading reflection could not be saved.');
    }
  }

  async function saveAttemptStart(attempt: ReadingAttempt, date: string) {
    if (!isValidReadingDate(date) || attempt.finishedOn && date > attempt.finishedOn) {
      setMessage('Start date must be on or before this Reading attempt finish date.');
      return;
    }
    try {
      await repository.updateAttemptStart(attempt.id, date);
      onReadingChanged();
      setMessage('Reading attempt start date saved.');
    } catch {
      setMessage('Reading attempt start date could not be saved.');
    }
  }

  async function saveAttemptFinish(attempt: ReadingAttempt, date: string, rating: number | null) {
    if (!isValidReadingDate(date) || date < attempt.startedOn || !isValidStarRating(rating)) {
      setMessage('Choose a valid finish date and a rating from 1 to 5 stars.');
      return;
    }
    try {
      await repository.updateAttemptFinish(attempt.id, date, rating);
      onReadingChanged();
      setMessage('Reading attempt finish details saved.');
    } catch {
      setMessage('Reading attempt finish details could not be saved.');
    }
  }

  async function deleteBookPage() {
    try {
      await pages.deleteBookPage(readBook.book.id);
      onReadingChanged();
      onBack();
    } catch {
      setMessage('The Book page could not be deleted. Try again.');
    }
  }

  async function chooseIllustration(field: BookPageField) {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage('Allow photo access to add an illustration.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.9 });
      if (result.canceled) return;
      const uri = result.assets[0]?.uri;
      if (uri) setDrafts((current) => ({ ...current, [field.id]: uri }));
    } catch {
      setMessage('Photos could not be opened. Check photo access and try again.');
    }
  }

  return (
    <View style={styles.detailPanel} testID="book-page">
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.secondaryButtonText}>‹ Read Books</Text>
      </Pressable>
      <Text style={styles.detailTitle}>{readBook.book.title}</Text>
      <View style={styles.bookOverview}>
        <BookCover book={readBook.book} large />
        <View style={styles.metadata}>
          <Text style={styles.metadataLine}>Author: {readBook.book.authors.join(', ') || 'Not listed'}</Text>
          <Text style={styles.metadataLine}>Categories: {readBook.book.categories.join(', ') || 'Not listed'}</Text>
          <Text style={styles.metadataLine}>Pages: {readBook.book.pageCount ?? 'Not listed'}</Text>
          <Text style={styles.metadataLine}>Latest rating: {formatRating(latestRating(readBook.attempts))}</Text>
        </View>
      </View>

      {isEditingBook ? (
        <View style={styles.rereadPanel}>
          <Text style={styles.sectionTitle}>Edit saved Book details</Text>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput accessibilityLabel="Book title" onChangeText={(title) => setBookDraft((current) => ({ ...current, title }))} style={styles.input} value={bookDraft.title} />
          <Text style={styles.fieldLabel}>Authors · comma separated</Text>
          <TextInput accessibilityLabel="Book authors" onChangeText={(value) => setBookDraft((current) => ({ ...current, authors: splitLines(value) }))} style={styles.input} value={bookDraft.authors.join(', ')} />
          <Text style={styles.fieldLabel}>Categories · comma separated</Text>
          <TextInput accessibilityLabel="Book categories" onChangeText={(value) => setBookDraft((current) => ({ ...current, categories: splitLines(value) }))} style={styles.input} value={bookDraft.categories.join(', ')} />
          <Text style={styles.fieldLabel}>Paperback page count</Text>
          <TextInput accessibilityLabel="Book page count" keyboardType="number-pad" onChangeText={(value) => setBookDraft((current) => ({ ...current, pageCount: value.trim() ? Number(value) : null }))} style={styles.input} value={bookDraft.pageCount === null ? '' : String(bookDraft.pageCount)} />
          <Text style={styles.fieldLabel}>Cover image URL</Text>
          <TextInput accessibilityLabel="Book cover URL" autoCapitalize="none" onChangeText={(coverUrl) => setBookDraft((current) => ({ ...current, coverUrl: coverUrl.trim() || null }))} style={styles.input} value={bookDraft.coverUrl ?? ''} />
          <Pressable accessibilityRole="button" onPress={() => void saveBookDetails()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Save Book details</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setBookDraft(toBookDraft(readBook.book)); setIsEditingBook(false); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" onPress={() => setIsEditingBook(true)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Edit Book details</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setShowDeleteConfirmation(true)} style={styles.destructiveButton}><Text style={styles.destructiveText}>Delete Book page</Text></Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>Book page notes</Text>
      {fields.map((field) => (
        <View key={field.id} style={styles.fieldPanel}>
          <Text style={styles.fieldLabel}>{field.label}{field.isTemplate ? ' · template' : ' · this Book'}</Text>
          {field.type === 'image' ? (
            <>
              {isImageUri(drafts[field.id] ?? imageDisplays[field.id]) ? <Image accessibilityLabel={field.label} source={{ uri: drafts[field.id] ?? imageDisplays[field.id] }} resizeMode="contain" style={styles.illustration} /> : null}
              <Pressable accessibilityRole="button" onPress={() => void chooseIllustration(field)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Choose from Photos</Text></Pressable>
              <TextInput accessibilityLabel={field.label} autoCapitalize="none" onChangeText={(value) => setDrafts((current) => ({ ...current, [field.id]: value }))} placeholder="Or paste an image link" style={styles.input} value={drafts[field.id] ?? ''} />
            </>
          ) : (
            <TextInput
              accessibilityLabel={field.label}
              multiline={field.type === 'multiline' || field.type === 'list'}
              onChangeText={(value) => setDrafts((current) => ({ ...current, [field.id]: value }))}
              placeholder={field.type === 'list' ? 'One item on each line' : `Write ${field.label.toLowerCase()}…`}
              style={[styles.input, (field.type === 'multiline' || field.type === 'list') && styles.multilineInput]}
              value={drafts[field.id] ?? ''}
            />
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={`Save ${field.label}`} onPress={() => void saveFieldValue(field)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Save {field.label}</Text></Pressable>
        </View>
      ))}
      {undo ? <Pressable accessibilityRole="button" onPress={() => void undoLastFieldEdit()} style={styles.undoButton}><Text style={styles.secondaryButtonText}>Undo last edit to {undo.field.label}</Text></Pressable> : null}

      <View style={styles.fieldPanel}>
        <Text style={styles.sectionTitle}>Add a field to this Book only</Text>
        <TextInput accessibilityLabel="Book-only field name" onChangeText={setNewLabel} placeholder="For example: Favorite chapter" style={styles.input} value={newLabel} />
        <View style={styles.buttonRow}>
          {fieldTypes.map(({ label, type }) => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: newType === type }} onPress={() => setNewType(type)} style={[styles.typeButton, newType === type && styles.selectedType]}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>)}
        </View>
        <Pressable accessibilityRole="button" onPress={() => void addBookField()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Add Book-only field</Text></Pressable>
      </View>

      <Text style={styles.sectionTitle}>Reading attempts · {readBook.attempts.length}</Text>
      {sortedAttempts.map((attempt) => (
        <AttemptDetails
          key={attempt.id}
          attempt={attempt}
          onSaveReflection={saveReflection}
          onSaveStart={saveAttemptStart}
          onSaveFinish={saveAttemptFinish}
        />
      ))}
      {currentAttempt ? (
        <Text style={styles.helpText}>This Book is currently being read. Finish it to add its next rating and finish date.</Text>
      ) : (
        <View style={styles.rereadPanel}>
          <Text style={styles.sectionTitle}>Read this Book again</Text>
          <Text style={styles.fieldLabel}>Reread start date</Text>
          <TextInput accessibilityLabel="Reread start date" keyboardType="numbers-and-punctuation" onChangeText={setStartedOn} placeholder="YYYY-MM-DD" style={styles.input} value={startedOn} />
          <Pressable accessibilityRole="button" accessibilityLabel="Read this Book again" disabled={isStarting} onPress={() => void startReread()} style={[styles.primaryButton, isStarting && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>{isStarting ? 'Starting…' : 'Start reread'}</Text>
          </Pressable>
        </View>
      )}
      {showDeleteConfirmation ? (
        <View accessibilityRole="alert" style={styles.confirmPanel}>
          <Text style={styles.confirmTitle}>Delete “{readBook.book.title}”?</Text>
          <Text style={styles.helpText}>This also removes its reading attempts, daily logs, notes, and bookshelf placement.</Text>
          <View style={styles.buttonRow}>
            <Pressable accessibilityRole="button" onPress={() => void deleteBookPage()} style={styles.destructiveButton}><Text style={styles.destructiveText}>Delete permanently</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowDeleteConfirmation(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Keep Book</Text></Pressable>
          </View>
        </View>
      ) : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    </View>
  );
}

function AttemptDetails({
  attempt,
  onSaveFinish,
  onSaveReflection,
  onSaveStart,
}: {
  attempt: ReadingAttempt;
  onSaveFinish(attempt: ReadingAttempt, date: string, rating: number | null): void;
  onSaveReflection(attempt: ReadingAttempt, reflection: string): void;
  onSaveStart(attempt: ReadingAttempt, date: string): void;
}) {
  const [startedOn, setStartedOn] = useState(attempt.startedOn);
  const [finishedOn, setFinishedOn] = useState(attempt.finishedOn ?? '');
  const [rating, setRating] = useState(attempt.rating);
  const [reflection, setReflection] = useState(attempt.reflection);
  useEffect(() => {
    setStartedOn(attempt.startedOn);
    setFinishedOn(attempt.finishedOn ?? '');
    setRating(attempt.rating);
    setReflection(attempt.reflection);
  }, [attempt.finishedOn, attempt.rating, attempt.reflection, attempt.startedOn]);
  return (
    <View style={styles.attemptPanel}>
      <Text style={styles.attemptLine}>{attempt.finishedOn ? `${attempt.startedOn} → ${attempt.finishedOn} · ${formatRating(attempt.rating)}` : `In progress · started ${attempt.startedOn}`}</Text>
      <Text style={styles.fieldLabel}>Start date</Text>
      <TextInput accessibilityLabel={`Start date for ${attempt.startedOn}`} keyboardType="numbers-and-punctuation" onChangeText={setStartedOn} style={styles.input} value={startedOn} />
      <Pressable accessibilityRole="button" onPress={() => onSaveStart(attempt, startedOn)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Save start date</Text></Pressable>
      {attempt.finishedOn ? (
        <>
          <Text style={styles.fieldLabel}>Finish date</Text>
          <TextInput accessibilityLabel={`Finish date for ${attempt.startedOn}`} keyboardType="numbers-and-punctuation" onChangeText={setFinishedOn} style={styles.input} value={finishedOn} />
          <Text style={styles.fieldLabel}>Rating · half stars</Text>
          <View style={styles.buttonRow}>
            {Array.from({ length: 9 }, (_, index) => (index + 2) / 2).map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Edit rating ${value} stars for ${attempt.startedOn}`} accessibilityState={{ selected: rating === value }} onPress={() => setRating(value)} style={[styles.typeButton, rating === value && styles.selectedType]}>
                <Text style={styles.secondaryButtonText}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Save finish details for ${attempt.startedOn}`} onPress={() => onSaveFinish(attempt, finishedOn, rating)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Save finish details</Text></Pressable>
        </>
      ) : null}
      <Text style={styles.fieldLabel}>Reflection for this Reading attempt</Text>
      <TextInput accessibilityLabel={`Reflection for ${attempt.startedOn}`} multiline onChangeText={setReflection} placeholder="How did this reading feel?" style={[styles.input, styles.multilineInput]} value={reflection} />
      <Pressable accessibilityRole="button" onPress={() => onSaveReflection(attempt, reflection)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Save reflection</Text></Pressable>
    </View>
  );
}

export function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  return (
    <View style={[styles.cover, large && styles.largeCover]}>
      {book.coverUrl ? <Image accessibilityLabel={`${book.title} cover`} resizeMode="cover" source={{ uri: book.coverUrl }} style={styles.coverImage} /> : <Text numberOfLines={4} style={styles.coverPlaceholder}>{book.title}</Text>}
    </View>
  );
}

function toBookDraft(book: Book): BookDraft {
  const { id: _id, ...draft } = book;
  return draft;
}

function isImageUri(value: string | undefined): boolean {
  return Boolean(value && /^(https?:\/\/|file:\/\/|blob:|data:image\/)/i.test(value));
}

function splitLines(value: string): string[] {
  return value.split(',').map((line) => line.trim()).filter(Boolean);
}

function latestRating(attempts: ReadingAttempt[]): number | null {
  const rated = attempts.filter((attempt) => attempt.finishedOn !== null && attempt.rating !== null)
    .sort((left, right) => (right.finishedOn ?? '').localeCompare(left.finishedOn ?? ''));
  return rated[0]?.rating ?? null;
}

function formatRating(rating: number | null): string {
  return rating === null ? 'Not rated' : `${rating} ${rating === 1 ? 'star' : 'stars'}`;
}

const styles = StyleSheet.create({
  detailPanel: { backgroundColor: '#FFFCF2', borderColor: colors.line, borderRadius: 20, borderWidth: 1, marginTop: 12, padding: 18 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 },
  detailTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 27, marginVertical: 12 },
  bookOverview: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  metadata: { flex: 1, gap: 9, minWidth: 180 },
  metadataLine: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, color: colors.ink, fontSize: 14, paddingBottom: 5 },
  cover: { alignItems: 'center', alignSelf: 'center', aspectRatio: 0.68, backgroundColor: '#F0EDDF', borderColor: colors.ink, borderRadius: 6, borderWidth: 1, justifyContent: 'center', maxWidth: 190, overflow: 'hidden', width: '100%' },
  largeCover: { aspectRatio: undefined, height: 220, maxWidth: undefined, width: 145 },
  coverImage: { height: '100%', width: '100%' },
  coverPlaceholder: { color: colors.ink, fontFamily: 'Georgia', fontSize: 15, padding: 12, textAlign: 'center' },
  sectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 20, marginTop: 20 },
  fieldPanel: { backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 14, borderWidth: 1, marginTop: 14, padding: 14 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  multilineInput: { minHeight: 100, textAlignVertical: 'top' },
  illustration: { backgroundColor: colors.paper, height: 240, marginVertical: 10, width: '100%' },
  buttonRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 11, justifyContent: 'center', marginTop: 12, minHeight: 46, paddingHorizontal: 14 },
  primaryButtonText: { color: colors.panel, fontSize: 13, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  destructiveButton: { alignItems: 'center', backgroundColor: '#FAECE7', borderColor: '#C48A7C', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 14 },
  destructiveText: { color: '#8B3F32', fontSize: 13, fontWeight: '700' },
  typeButton: { borderColor: colors.line, borderRadius: 9, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 },
  selectedType: { backgroundColor: '#E9E8DA', borderColor: colors.olive },
  undoButton: { alignSelf: 'flex-start', backgroundColor: '#E9E8DA', borderRadius: 10, marginTop: 12, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  attemptPanel: { backgroundColor: colors.paper, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 12, padding: 12 },
  attemptLine: { color: colors.ink, fontSize: 14, paddingVertical: 6 },
  rereadPanel: { backgroundColor: colors.paper, borderRadius: 14, marginTop: 14, padding: 14 },
  disabledButton: { opacity: 0.55 },
  helpText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 9 },
  confirmPanel: { backgroundColor: '#FAECE7', borderColor: '#C48A7C', borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 16 },
  confirmTitle: { color: '#8B3F32', fontFamily: 'Georgia', fontSize: 20 },
  message: { color: colors.olive, fontSize: 13, marginTop: 12 },
});
