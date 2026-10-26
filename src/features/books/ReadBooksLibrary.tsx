import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookPageRepository } from '../../books/bookPageTypes';
import type { ReadBook, ReadingAttempt, ReadingRepository } from '../../reading/readingTypes';
import { journalColors as colors } from '../../theme/colors';
import { BookPage, BookCover } from './BookPage';
import { BookPageTemplateEditor } from './BookPageTemplateEditor';

interface ReadBooksLibraryProps {
  ownerSubject: string;
  repository: ReadingRepository;
  pages: BookPageRepository;
  refreshToken: number;
  onReadingChanged(): void;
}

export function ReadBooksLibrary({ onReadingChanged, ownerSubject, pages, refreshToken, repository }: ReadBooksLibraryProps) {
  const [books, setBooks] = useState<ReadBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);

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
      {isEditingTemplate ? (
        <BookPageTemplateEditor pages={pages} onBack={() => setIsEditingTemplate(false)} />
      ) : selectedBook ? (
        <BookPage
          readBook={selectedBook}
          ownerSubject={ownerSubject}
          repository={repository}
          pages={pages}
          onBack={() => setSelectedBookId(null)}
          onReadingChanged={onReadingChanged}
        />
      ) : (
        <>
          <Text style={styles.pageTitle}>Read Books</Text>
          <Text style={styles.summary}>Read books · {books.length} unique Book</Text>
          <Text style={styles.summary}>Reading attempts · {attemptCount}</Text>
          <Pressable accessibilityRole="button" onPress={() => setIsEditingTemplate(true)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Customize Book page template</Text>
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

function latestRating(attempts: ReadingAttempt[]): number | null {
  const rated = attempts
    .filter((attempt) => attempt.finishedOn !== null && attempt.rating !== null)
    .sort((left, right) => (right.finishedOn ?? '').localeCompare(left.finishedOn ?? ''));
  return rated[0]?.rating ?? null;
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
  bookTile: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, maxWidth: 230, padding: 10, width: '31%' },
  bookTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 14, marginTop: 8 },
  bookAuthors: { color: colors.muted, fontSize: 11, marginTop: 3 },
  stars: { color: '#806C3E', fontSize: 16, letterSpacing: 1, marginTop: 4 },
  emptyState: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14, padding: 18 },
  error: { color: colors.error, fontSize: 13, marginTop: 10 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.olive, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
});
