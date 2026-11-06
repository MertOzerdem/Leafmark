import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookCatalog } from '../../books/bookTypes';
import type { BookPageRepository } from '../../books/bookPageTypes';
import type { BookPageFieldType } from '../../books/bookPageTypes';
import type { ReadBook, ReadingAttempt, ReadingRepository } from '../../reading/readingTypes';
import { journalColors as colors } from '../../theme/colors';
import { BookPage, BookCover, type BookPageSaveStatus } from './BookPage';
import { FinishedBookForm, type FinishedBookFormDraft } from './FinishedBookForm';
import { RatingStars } from './RatingStars';

interface ReadBooksLibraryProps {
  ownerSubject: string;
  catalog: BookCatalog;
  repository: ReadingRepository;
  pages: BookPageRepository;
  refreshToken: number;
  onReadingChanged(): void;
  savePageActionRef?: React.MutableRefObject<() => void>;
  onSaveStatusChange?(status: BookPageSaveStatus | null): void;
}

export function ReadBooksLibrary({ catalog, onReadingChanged, onSaveStatusChange, ownerSubject, pages, refreshToken, repository, savePageActionRef }: ReadBooksLibraryProps) {
  const [books, setBooks] = useState<ReadBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingFinishedBook, setIsAddingFinishedBook] = useState(false);
  const [isSavingFinishedBook, setIsSavingFinishedBook] = useState(false);

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

  async function addFinishedBook(draft: FinishedBookFormDraft) {
    setIsSavingFinishedBook(true);
    setError(null);
    try {
      const book = await repository.addFinishedBook(draft);
      const details: Array<{ label: string; type: BookPageFieldType; value: string }> = [
        { label: 'Series', type: 'text', value: draft.series },
        { label: 'Couple', type: 'text', value: draft.couple },
        { label: 'Favorite quotes', type: 'multiline', value: draft.favoriteQuotes },
        { label: 'Personal thoughts', type: 'multiline', value: draft.personalThoughts },
        { label: 'Illustration', type: 'image', value: draft.illustration },
      ];
      let optionalDetailsFailed = false;
      try {
        const existingFields = await pages.listFields(book.id);
        for (const detail of details) {
          if (!detail.value) continue;
          const field = existingFields.find((entry) => entry.label.trim().toLowerCase() === detail.label.toLowerCase()) ??
            await pages.addField({ bookId: book.id, label: detail.label, type: detail.type, position: existingFields.length });
          if (detail.type === 'image') await pages.uploadImage(ownerSubject, book.id, field.id, detail.value);
          else await pages.saveValue(book.id, field.id, detail.value);
        }
      } catch {
        optionalDetailsFailed = true;
      }
      await loadBooks();
      setSelectedBookId(optionalDetailsFailed ? null : book.id);
      setIsAddingFinishedBook(false);
      onReadingChanged();
      if (optionalDetailsFailed) setError('The finished Book was saved, but one or more page details need another save. Open the Book and save those fields again.');
    } catch {
      setError('The finished Book could not be saved. Check its dates, rating, and reading total.');
    } finally {
      setIsSavingFinishedBook(false);
    }
  }

  return (
    <View style={styles.container}>
      {isAddingFinishedBook ? (
        <FinishedBookForm catalog={catalog} repository={repository} isSaving={isSavingFinishedBook} submissionError={error} onCancel={() => setIsAddingFinishedBook(false)} onSave={(draft) => void addFinishedBook(draft)} />
      ) : selectedBook ? (
        <BookPage
          readBook={selectedBook}
          ownerSubject={ownerSubject}
          repository={repository}
          pages={pages}
          onBack={() => setSelectedBookId(null)}
          onReadingChanged={onReadingChanged}
          savePageActionRef={savePageActionRef}
          onSaveStatusChange={onSaveStatusChange}
        />
      ) : (
        <>
          <Text style={styles.pageTitle}>Books Read</Text>
          <Text style={styles.summary}>Read books · {books.length} unique Book</Text>
          <Text style={styles.summary}>Reading attempts · {attemptCount}</Text>
          <Pressable accessibilityRole="button" onPress={() => setIsAddingFinishedBook(true)} style={styles.addFinishedButton}>
            <Text style={styles.addFinishedText}>＋ Add a finished Book</Text>
          </Pressable>
          {isLoading ? <ActivityIndicator color={colors.olive} style={styles.loader} /> : null}
          {error ? (
            <View>
              <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void loadBooks()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : books.length === 0 && !isLoading ? (
            <>
              <Text style={styles.emptyGallery}>Your first finished Book will find a place here.</Text>
              <View style={styles.bookGrid}>
                {Array.from({ length: 9 }, (_, index) => (
                  <View key={index} style={styles.bookTile}>
                    <View accessibilityLabel="Empty book cover slot" style={styles.emptyCover} />
                    <Text style={styles.stars}>☆☆☆☆☆</Text>
                  </View>
                ))}
              </View>
            </>
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
                  <Text numberOfLines={2} style={styles.bookTitle}>{readBook.book.title}</Text>
                  <BookCover book={readBook.book} />
                  <View accessibilityLabel={`Latest rating: ${formatRating(latestRating(readBook.attempts))}`} style={styles.stars}>
                    <RatingStars rating={latestRating(readBook.attempts)} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </>
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

function formatRating(rating: number | null): string {
  if (rating === null) return 'Not rated';
  return `${rating} ${rating === 1 ? 'star' : 'stars'}`;
}

const styles = StyleSheet.create({
  container: { marginTop: 20 },
  pageTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 38, textAlign: 'center' },
  summary: { color: colors.muted, fontSize: 13, marginTop: 5 },
  loader: { marginVertical: 14 },
  bookGrid: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 22, justifyContent: 'space-between', marginTop: 24 },
  bookTile: { alignItems: 'center', maxWidth: 190, minWidth: 120, paddingBottom: 8, width: '30%' },
  bookTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 17, lineHeight: 21, minHeight: 42, textAlign: 'center' },
  stars: { alignItems: 'center', marginTop: 7 },
  emptyCover: { alignSelf: 'center', aspectRatio: 0.68, backgroundColor: 'transparent', borderColor: colors.ink, borderRadius: 5, borderWidth: 2, maxWidth: 190, width: '100%' },
  emptyGallery: { color: colors.muted, fontSize: 13, marginTop: 12, textAlign: 'center' },
  error: { color: colors.error, fontSize: 13, marginTop: 10 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.olive, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  addFinishedButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.olive, borderRadius: 10, justifyContent: 'center', marginTop: 14, minHeight: 46, paddingHorizontal: 16 },
  addFinishedText: { color: colors.panel, fontSize: 14, fontWeight: '700' },
});
