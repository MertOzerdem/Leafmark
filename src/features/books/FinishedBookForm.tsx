import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BookCatalog, BookDraft } from '../../books/bookTypes';
import type { ReadingConfiguration, ReadingMeasure } from '../../reading/readingTypes';
import type { ReadingRepository } from '../../reading/readingTypes';
import { isValidReadingDate, todayDate } from '../../reading/readingDates';
import { journalColors as colors } from '../../theme/colors';
import { RatingStars } from './RatingStars';
import { pickBookImage } from './pickBookImage';

export interface FinishedBookFormDraft {
  book: BookDraft;
  startedOn: string;
  finishedOn: string;
  rating: number;
  measure: ReadingMeasure;
  totalAmount: number | null;
  series: string;
  couple: string;
  favoriteQuotes: string;
  personalThoughts: string;
  illustration: string;
}

interface FinishedBookFormProps {
  catalog: BookCatalog;
  repository: ReadingRepository;
  isSaving: boolean;
  submissionError?: string | null;
  onCancel(): void;
  onSave(draft: FinishedBookFormDraft): void;
}

const emptyBook: BookDraft = {
  googleVolumeId: null,
  title: '',
  authors: [],
  coverUrl: null,
  categories: [],
  pageCount: null,
  description: null,
};

export function FinishedBookForm({ catalog, isSaving, onCancel, onSave, repository, submissionError }: FinishedBookFormProps) {
  const today = todayDate();
  const [book, setBook] = useState<BookDraft>(emptyBook);
  const [startedOn, setStartedOn] = useState(today);
  const [finishedOn, setFinishedOn] = useState(today);
  const [rating, setRating] = useState<number | null>(null);
  const [measure, setMeasure] = useState<ReadingMeasure>('minutes');
  const [configurations, setConfigurations] = useState<ReadingConfiguration[]>([]);
  const [totalAmount, setTotalAmount] = useState('');
  const [series, setSeries] = useState('');
  const [couple, setCouple] = useState('');
  const [favoriteQuotes, setFavoriteQuotes] = useState('');
  const [personalThoughts, setPersonalThoughts] = useState('');
  const [illustration, setIllustration] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookDraft[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void repository.loadSnapshot(Number(today.slice(0, 4))).then((snapshot) => {
      setConfigurations(snapshot.configurations);
    }).catch(() => undefined);
  }, [repository, today]);

  const configurationForDate = useMemo(() => configurations
    .filter((configuration) => configuration.startsOn <= finishedOn)
    .sort((left, right) => right.startsOn.localeCompare(left.startsOn))[0], [configurations, finishedOn]);

  useEffect(() => {
    setMeasure(configurationForDate?.measure ?? 'minutes');
  }, [configurationForDate?.measure]);

  async function searchBooks() {
    if (!searchQuery.trim()) {
      setError('Enter a title or author to search.');
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const results = await catalog.search(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) setError('No catalog matches found. Enter the book details below.');
    } catch {
      setSearchResults([]);
      setError('Book search is unavailable. Enter the book details below.');
    } finally {
      setIsSearching(false);
    }
  }

  async function chooseCover() {
    try {
      const image = await pickBookImage();
      if (image) setBook((current) => ({ ...current, coverUrl: image }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The cover image could not be opened.');
    }
  }

  async function chooseIllustration() {
    try {
      const image = await pickBookImage();
      if (image) setIllustration(image);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The illustration could not be opened.');
    }
  }

  function submit() {
    const amount = totalAmount.trim() ? Number(totalAmount) : null;
    if (!book.title.trim()) {
      setError('Enter the book title.');
      return;
    }
    if (book.pageCount !== null && (!Number.isInteger(book.pageCount) || book.pageCount < 1)) {
      setError('Page count must be a positive whole number.');
      return;
    }
    if (!isValidReadingDate(startedOn) || !isValidReadingDate(finishedOn) || finishedOn < startedOn) {
      setError('Choose valid dates. The start date must be on or before the finish date.');
      return;
    }
    if (rating === null) {
      setError('Choose a rating from one to five stars.');
      return;
    }
    if (amount !== null && (!Number.isInteger(amount) || amount < 0)) {
      setError(`Enter a non-negative whole number for ${measure}.`);
      return;
    }

    onSave({
      book: { ...book, title: book.title.trim() },
      startedOn,
      finishedOn,
      rating,
      measure,
      totalAmount: amount,
      series: series.trim(),
      couple: couple.trim(),
      favoriteQuotes: favoriteQuotes.trim(),
      personalThoughts: personalThoughts.trim(),
      illustration,
    });
  }

  return (
    <View style={styles.panel} testID="finished-book-form">
      <Text style={styles.heading}>Add a finished Book</Text>
      <Text style={styles.intro}>Create it directly in Read Books. No TBR step is needed.</Text>

      <View style={styles.searchRow}>
        <TextInput accessibilityLabel="Search catalog for a finished book" onChangeText={setSearchQuery} onSubmitEditing={() => void searchBooks()} placeholder="Search title or author" style={[styles.input, styles.searchInput]} value={searchQuery} />
        <Pressable accessibilityRole="button" disabled={isSearching || isSaving} onPress={() => void searchBooks()} style={styles.secondaryButton}>
          {isSearching ? <ActivityIndicator color={colors.olive} /> : <Text style={styles.buttonText}>Search</Text>}
        </Pressable>
      </View>
      {searchResults.length > 0 ? (
        <View style={styles.searchResults}>
          {searchResults.map((result, index) => (
            <Pressable key={result.googleVolumeId ?? `${result.title}-${index}`} accessibilityRole="button" onPress={() => { setBook(result); setSearchResults([]); setError(null); }} style={styles.resultRow}>
              <Text style={styles.resultTitle}>{result.title}</Text>
              <Text style={styles.helpText}>{result.authors.join(', ') || 'Author not listed'}{result.pageCount ? ` · ${result.pageCount} pages` : ''}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.fieldLabel}>Book details</Text>
      <Field label="Title" value={book.title} onChange={(title) => setBook((current) => ({ ...current, title }))} />
      <Field label="Authors · comma separated" value={book.authors.join(', ')} onChange={(value) => setBook((current) => ({ ...current, authors: splitValues(value) }))} />
      <Field label="Categories · comma separated" value={book.categories.join(', ')} onChange={(value) => setBook((current) => ({ ...current, categories: splitValues(value) }))} />
      <Field label="Paperback page count" keyboardType="number-pad" value={book.pageCount?.toString() ?? ''} onChange={(value) => setBook((current) => ({ ...current, pageCount: value.trim() ? Number(value) : null }))} />
      <Field label="Description" multiline value={book.description ?? ''} onChange={(description) => setBook((current) => ({ ...current, description: description.trim() || null }))} />

      <Text style={styles.fieldLabel}>Book cover · JPG, JPEG, or PNG</Text>
      {book.coverUrl ? <Image accessibilityLabel="Selected book cover" source={{ uri: book.coverUrl }} resizeMode="cover" style={styles.coverPreview} /> : null}
      <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void chooseCover()} style={styles.secondaryButton}><Text style={styles.buttonText}>{book.coverUrl ? 'Choose a different cover image' : 'Upload cover image'}</Text></Pressable>

      <Text style={styles.fieldLabel}>Reading attempt</Text>
      <Field label="Started on · YYYY-MM-DD" value={startedOn} onChange={setStartedOn} />
      <Field label="Finished on · YYYY-MM-DD" value={finishedOn} onChange={setFinishedOn} />
      <Text style={styles.fieldLabel}>Rating · half stars</Text>
      <View style={styles.ratingChoices}>
        {Array.from({ length: 9 }, (_, index) => (index + 2) / 2).map((value) => (
          <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Rate ${value} stars`} accessibilityState={{ selected: rating === value }} onPress={() => setRating(value)} style={[styles.ratingChoice, rating === value && styles.selectedRating]}>
            <RatingStars rating={value} size={17} />
          </Pressable>
        ))}
      </View>
      <Field label={`Total reading ${measure} · optional`} keyboardType="number-pad" value={totalAmount} onChange={setTotalAmount} />
      <Text style={styles.helpText}>{configurationForDate ? `The selected date uses the ${measure} measure set in Settings.` : 'Reading measure starts as minutes. Set the tracker measure in Settings any time.'}</Text>

      <Text style={styles.fieldLabel}>Book page details</Text>
      <Field label="Series" value={series} onChange={setSeries} />
      <Field label="Couple" value={couple} onChange={setCouple} />
      <Field label="Favorite quotes" multiline value={favoriteQuotes} onChange={setFavoriteQuotes} />
      <Field label="Personal thoughts" multiline value={personalThoughts} onChange={setPersonalThoughts} />
      <Text style={styles.fieldLabel}>Illustration · JPG, JPEG, or PNG</Text>
      {illustration ? <Image accessibilityLabel="Selected book illustration" source={{ uri: illustration }} resizeMode="contain" style={styles.illustrationPreview} /> : null}
      <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void chooseIllustration()} style={styles.secondaryButton}><Text style={styles.buttonText}>{illustration ? 'Choose a different illustration' : 'Upload illustration'}</Text></Pressable>

      {submissionError ?? error ? <Text accessibilityRole="alert" style={styles.error}>{submissionError ?? error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={isSaving} onPress={submit} style={[styles.primaryButton, isSaving && styles.disabledButton]}>
          {isSaving ? <ActivityIndicator color={colors.panel} /> : <Text style={styles.primaryText}>Save as read</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={isSaving} onPress={onCancel} style={styles.cancelButton}><Text style={styles.buttonText}>Cancel</Text></Pressable>
      </View>
    </View>
  );
}

function Field({ label, keyboardType, multiline, onChange, value }: { label: string; keyboardType?: 'default' | 'number-pad'; multiline?: boolean; onChange(value: string): void; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} keyboardType={keyboardType} multiline={multiline} onChangeText={onChange} placeholder={label} style={[styles.input, multiline && styles.multiline]} value={value} />
    </View>
  );
}

function splitValues(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFFCF2', borderColor: colors.line, borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 18 },
  heading: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 28 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  searchRow: { alignItems: 'stretch', flexDirection: 'row', gap: 8, marginTop: 18 },
  searchInput: { flex: 1 },
  searchResults: { backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 10, borderWidth: 1, marginTop: 6 },
  resultRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, padding: 12 },
  resultTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  field: { marginTop: 8 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  coverPreview: { alignSelf: 'flex-start', borderRadius: 8, height: 190, width: 132 },
  illustrationPreview: { backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 10, borderWidth: 1, height: 220, width: '100%' },
  ratingChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ratingChoice: { alignItems: 'center', borderColor: colors.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 38, minWidth: 62, paddingHorizontal: 5 },
  selectedRating: { backgroundColor: '#E9E8DA', borderColor: colors.olive },
  helpText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 7 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 42, paddingHorizontal: 13 },
  cancelButton: { alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 16 },
  buttonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 10, justifyContent: 'center', minHeight: 46, minWidth: 130, paddingHorizontal: 16 },
  primaryText: { color: colors.panel, fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
  error: { color: colors.error, fontSize: 13, marginTop: 12 },
});
