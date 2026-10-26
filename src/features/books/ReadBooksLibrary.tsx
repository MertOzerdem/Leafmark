import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Book } from '../../books/bookTypes';
import { isValidReadingDate, todayDate } from '../../reading/readingDates';
import type { ReadBook, ReadingAttempt, ReadingRepository } from '../../reading/readingTypes';
import { journalColors as colors } from '../../theme/colors';

interface ReadBooksLibraryProps {
  repository: ReadingRepository;
  refreshToken: number;
  onReadingChanged(): void;
}

export function ReadBooksLibrary({ repository, refreshToken, onReadingChanged }: ReadBooksLibraryProps) {
  const [books, setBooks] = useState<ReadBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setIsLoading(true);
    try {
      setBooks(await repository.loadReadBooks());
      setError(null);
    } catch {
      setError('Your read books could not be loaded. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks, refreshToken]);

  const selectedBook = books.find(({ book }) => book.id === selectedBookId) ?? null;
  const attemptCount = books.reduce((total, readBook) => total + readBook.attempts.length, 0);

  return (
    <View style={styles.container}>
      {selectedBook ? (
        <BookPage
          readBook={selectedBook}
          repository={repository}
          onBack={() => setSelectedBookId(null)}
          onReadingChanged={onReadingChanged}
        />
      ) : (
        <>
          <Text style={styles.pageTitle}>Read Books</Text>
          <Text style={styles.summary}>Read books · {books.length} unique Book</Text>
          <Text style={styles.summary}>Reading attempts · {attemptCount}</Text>
          {isLoading ? <ActivityIndicator color={colors.olive} style={styles.loader} /> : null}
          {error ? (
            <View>
              <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void loadBooks()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : books.length === 0 && !isLoading ? (
            <Text style={styles.emptyState}>Finished Books will gather here with their reading history.</Text>
          ) : (
            <View testID="read-books-grid" style={styles.bookGrid}>
              {books.map((readBook) => (
                <Pressable
                  key={readBook.book.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${readBook.book.title}`}
                  onPress={() => setSelectedBookId(readBook.book.id)}
                  style={styles.bookTile}
                >
                  <BookCover book={readBook.book} />
                  <Text numberOfLines={2} style={styles.bookTitle}>{readBook.book.title}</Text>
                  <Text numberOfLines={1} style={styles.bookAuthors}>{readBook.book.authors.join(', ') || 'Author not listed'}</Text>
                  <Text accessibilityLabel={`Latest rating: ${formatRating(latestRating(readBook.attempts))}`} style={styles.stars}>
                    {starsFor(latestRating(readBook.attempts))}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function BookPage({
  onBack,
  onReadingChanged,
  readBook,
  repository,
}: {
  onBack(): void;
  onReadingChanged(): void;
  readBook: ReadBook;
  repository: ReadingRepository;
}) {
  const [startedOn, setStartedOn] = useState(todayDate());
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const currentAttempt = readBook.attempts.find((attempt) => attempt.isCurrent);
  const sortedAttempts = [...readBook.attempts].sort((left, right) =>
    (right.finishedOn ?? right.startedOn).localeCompare(left.finishedOn ?? left.startedOn),
  );

  async function startReread() {
    if (currentAttempt || !isValidReadingDate(startedOn)) {
      setMessage(currentAttempt ? 'This Book is already the Current book.' : 'Enter a valid reread start date.');
      return;
    }
    setIsStarting(true);
    setMessage(null);
    try {
      await repository.startReread(readBook.book.id, startedOn);
      onReadingChanged();
    } catch {
      setMessage('A new Reading attempt could not be started. Try again.');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <View style={styles.detailPanel}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.secondaryButtonText}>‹ Read Books</Text>
      </Pressable>
      <Text style={styles.detailTitle}>Book page: {readBook.book.title}</Text>
      <View style={styles.bookOverview}>
        <BookCover book={readBook.book} large />
        <View style={styles.metadata}>
          <Text style={styles.metadataLine}>Author: {readBook.book.authors.join(', ') || 'Not listed'}</Text>
          <Text style={styles.metadataLine}>Categories: {readBook.book.categories.join(', ') || 'Not listed'}</Text>
          <Text style={styles.metadataLine}>Pages: {readBook.book.pageCount ?? 'Not listed'}</Text>
          <Text style={styles.metadataLine}>Latest rating: {formatRating(latestRating(readBook.attempts))}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Reading attempts · {readBook.attempts.length}</Text>
      {sortedAttempts.map((attempt) => (
        <Text key={attempt.id} style={styles.attemptLine}>
          {describeAttempt(attempt)}
        </Text>
      ))}

      {currentAttempt ? (
        <Text style={styles.helpText}>This Book is currently being read. Finish it to add its next rating and finish date.</Text>
      ) : (
        <View style={styles.rereadPanel}>
          <Text style={styles.sectionTitle}>Read this Book again</Text>
          <Text style={styles.fieldLabel}>Reread start date</Text>
          <TextInput
            accessibilityLabel="Reread start date"
            keyboardType="numbers-and-punctuation"
            onChangeText={setStartedOn}
            placeholder="YYYY-MM-DD"
            style={styles.input}
            value={startedOn}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read this Book again"
            disabled={isStarting}
            onPress={() => void startReread()}
            style={[styles.primaryButton, isStarting && styles.disabledButton]}
          >
            {isStarting ? <ActivityIndicator color={colors.panel} /> : <Text style={styles.primaryButtonText}>Start reread</Text>}
          </Pressable>
        </View>
      )}
      {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
    </View>
  );
}

function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  return (
    <View style={[styles.cover, large && styles.largeCover]}>
      {book.coverUrl ? (
        <Image accessibilityLabel={`${book.title} cover`} resizeMode="cover" source={{ uri: book.coverUrl }} style={styles.coverImage} />
      ) : (
        <Text numberOfLines={4} style={styles.coverPlaceholder}>{book.title}</Text>
      )}
    </View>
  );
}

function latestRating(attempts: ReadingAttempt[]): number | null {
  const rated = attempts
    .filter((attempt) => attempt.finishedOn !== null && attempt.rating !== null)
    .sort((left, right) => (right.finishedOn ?? '').localeCompare(left.finishedOn ?? ''));
  return rated[0]?.rating ?? null;
}

function describeAttempt(attempt: ReadingAttempt): string {
  if (!attempt.finishedOn) return `In progress · started ${attempt.startedOn}`;
  return `${attempt.startedOn} → ${attempt.finishedOn} · ${formatRating(attempt.rating)}`;
}

function starsFor(rating: number | null): string {
  if (rating === null) return 'Not rated yet';
  const wholeStars = Math.floor(rating);
  const halfStar = rating % 1 === 0.5;
  return `${'★'.repeat(wholeStars)}${halfStar ? '½' : ''}${'☆'.repeat(5 - wholeStars - (halfStar ? 1 : 0))}`;
}

function formatRating(rating: number | null): string {
  if (rating === null) return 'Not rated';
  return `${rating} ${rating === 1 ? 'star' : 'stars'}`;
}

const styles = StyleSheet.create({
  container: { marginTop: 30 },
  pageTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 30 },
  summary: { color: colors.muted, fontSize: 13, marginTop: 5 },
  loader: { marginVertical: 14 },
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 18 },
  bookTile: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, padding: 10, width: '31%' },
  cover: { alignItems: 'center', backgroundColor: '#F0EDDF', borderColor: colors.ink, borderRadius: 6, borderWidth: 1, height: 176, justifyContent: 'center', overflow: 'hidden', width: '100%' },
  largeCover: { height: 220, width: 145 },
  coverImage: { height: '100%', width: '100%' },
  coverPlaceholder: { color: colors.ink, fontFamily: 'Georgia', fontSize: 15, padding: 12, textAlign: 'center' },
  bookTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 14, marginTop: 8 },
  bookAuthors: { color: colors.muted, fontSize: 11, marginTop: 3 },
  stars: { color: '#806C3E', fontSize: 16, letterSpacing: 1, marginTop: 4 },
  emptyState: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14, padding: 18 },
  error: { color: colors.error, fontSize: 13, marginTop: 10 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.olive, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  detailPanel: { backgroundColor: '#FFFCF2', borderColor: colors.line, borderRadius: 20, borderWidth: 1, marginTop: 12, padding: 18 },
  backButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  detailTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 24, marginVertical: 12 },
  bookOverview: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  metadata: { flex: 1, gap: 9, minWidth: 180 },
  metadataLine: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, color: colors.ink, fontSize: 14, paddingBottom: 5 },
  sectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 19, marginTop: 20 },
  attemptLine: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, color: colors.ink, fontSize: 14, paddingVertical: 11 },
  helpText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 14 },
  rereadPanel: { backgroundColor: colors.paper, borderRadius: 14, marginTop: 14, padding: 14 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 44, paddingHorizontal: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 11, justifyContent: 'center', marginTop: 12, minHeight: 44, paddingHorizontal: 14 },
  primaryButtonText: { color: colors.panel, fontSize: 13, fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
});
