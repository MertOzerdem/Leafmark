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

import type { BookCatalog, BookDraft, TbrBook, TbrRepository } from '../../books/bookTypes';
import { journalColors as colors } from '../../theme/colors';
import { pickBookImage } from './pickBookImage';

interface TbrScreenProps {
  catalog: BookCatalog;
  onBooksChanged(): void;
  refreshToken: number;
  repository: TbrRepository;
}

interface BookEditorProps {
  initialBook: BookDraft;
  mode: 'create' | 'edit';
  isSaving: boolean;
  onCancel(): void;
  onSave(book: BookDraft): void;
}

const categoryPalette = ['#8E758B', '#D59AAA', '#8190A4', '#A5AA77', '#C2A67A'];
const editorLabels = {
  create: { heading: 'Add book details', submit: 'Save to TBR' },
  edit: { heading: 'Edit book details', submit: 'Save changes' },
} as const;

const emptyBook: BookDraft = {
  googleVolumeId: null,
  title: '',
  authors: [],
  coverUrl: null,
  categories: [],
  pageCount: null,
  description: null,
};

export function TbrScreen({ catalog, onBooksChanged, refreshToken, repository }: TbrScreenProps) {
  const [books, setBooks] = useState<TbrBook[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookDraft[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create'; initialBook: BookDraft } | { mode: 'edit'; initialBook: TbrBook } | null>(null);

  const loadBooks = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextBooks, nextColors] = await Promise.all([repository.list(), repository.listCategoryColors()]);
      setBooks(nextBooks);
      setCategoryColors(nextColors);
      setListMessage(null);
    } catch {
      setListMessage('Your To Be Read list could not be loaded. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks, refreshToken]);

  async function searchCatalog() {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setSearchMessage('Enter a title or author to search.');
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchMessage(null);
    try {
      const results = await catalog.search(normalizedQuery);
      setSearchResults(results);
      if (results.length === 0) setSearchMessage('No matches found. Add the book manually instead.');
    } catch {
      setSearchResults([]);
      setSearchMessage('Book catalogs are unavailable right now. You can still add a book manually.');
    } finally {
      setIsSearching(false);
    }
  }

  async function saveBook(book: BookDraft) {
    setIsSaving(true);
    setListMessage(null);
    try {
      if (editor?.mode === 'edit') {
        await repository.update(editor.initialBook.id, book);
        await loadBooks();
        onBooksChanged();
      } else {
        await addBookAndReload(book);
      }
      setEditor(null);
    } catch {
      setListMessage('The book could not be saved. Try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeBook(bookId: string) {
    try {
      await repository.remove(bookId);
      setBooks((currentBooks) => currentBooks.filter((book) => book.id !== bookId));
    } catch {
      setListMessage('The book could not be removed from TBR. Try again.');
    }
  }

  async function moveBook(bookId: string, direction: -1 | 1) {
    const currentIndex = books.findIndex((book) => book.id === bookId);
    const destinationIndex = currentIndex + direction;
    if (currentIndex < 0 || destinationIndex < 0 || destinationIndex >= books.length) return;

    const reordered = [...books];
    [reordered[currentIndex], reordered[destinationIndex]] = [
      reordered[destinationIndex],
      reordered[currentIndex],
    ];
    setBooks(reordered);
    try {
      await repository.reorder(reordered.map((book) => book.id));
    } catch {
      setListMessage('The new TBR order could not be saved. Try again.');
      await loadBooks();
    }
  }

  async function addCatalogBook(book: BookDraft) {
    setIsSaving(true);
    setListMessage(null);
    try {
      await addBookAndReload(book);
    } catch {
      setListMessage('The book could not be added to TBR. Try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function addBookAndReload(book: BookDraft) {
    await repository.add(book);
    await loadBooks();
    onBooksChanged();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>To Be Read</Text>
      <Text style={styles.sectionHint}>Books you would like to read next.</Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search books by title or author"
          autoCapitalize="sentences"
          onChangeText={setQuery}
          onSubmitEditing={() => void searchCatalog()}
          placeholder="Search by title or author"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={[styles.input, styles.searchInput]}
          value={query}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search book catalogs"
          disabled={isSearching || isSaving}
          onPress={() => void searchCatalog()}
          style={styles.primaryButton}
        >
          {isSearching ? <ActivityIndicator color={colors.panel} /> : <Text style={styles.primaryButtonText}>Search</Text>}
        </Pressable>
      </View>
      {searchMessage ? <Text accessibilityRole="alert" style={styles.message}>{searchMessage}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={isSaving}
        onPress={() => setEditor({ mode: 'create', initialBook: emptyBook })}
        style={styles.manualButton}
      >
        <Text style={styles.manualButtonText}>Add book manually</Text>
      </Pressable>

      {editor ? (
        <BookEditor
          key={editor.mode === 'edit' ? editor.initialBook.id : 'new-book'}
          initialBook={editor.initialBook}
          isSaving={isSaving}
          mode={editor.mode}
          onCancel={() => setEditor(null)}
          onSave={(book) => void saveBook(book)}
        />
      ) : null}

      {searchResults.length > 0 ? (
        <View style={styles.resultsSection}>
          <Text style={styles.listTitle}>Search results</Text>
          {searchResults.map((book) => {
            const alreadyInTbr = books.some((savedBook) => savedBook.googleVolumeId === book.googleVolumeId);
            return (
              <View key={book.googleVolumeId} style={styles.bookCard}>
                <BookCover book={book} />
                <View style={styles.bookDetails}>
                  <Text style={styles.bookTitle}>{book.title}</Text>
                  <Text style={styles.bookAuthors}>{book.authors.join(', ') || 'Author not listed'}</Text>
                  <BookMetadata book={book} missingPageCountLabel="Page count unavailable" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={alreadyInTbr ? `Already in TBR: ${book.title}` : `Add to TBR: ${book.title}`}
                    disabled={alreadyInTbr || isSaving}
                    onPress={() => void addCatalogBook(book)}
                    style={[styles.smallButton, alreadyInTbr && styles.disabledButton]}
                  >
                    <Text style={styles.smallButtonText}>{alreadyInTbr ? 'In your TBR' : 'Add to TBR'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {listMessage ? (
        <View>
          <Text accessibilityRole="alert" style={styles.message}>{listMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadBooks()} style={styles.manualButton}>
            <Text style={styles.manualButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.listTitle}>Your list · {books.length}</Text>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.olive} />
          <Text style={styles.bookMetadata}>Loading your books…</Text>
        </View>
      ) : books.length === 0 ? (
        <View style={styles.tbrPaper}>
          <Text style={styles.emptyPadHint}>Your list is empty. Search for a book or add one manually.</Text>
          {Array.from({ length: 7 }, (_, index) => (
            <View key={index} style={styles.emptyPadEntry}>
              <Text style={styles.emptyPadHeart}>♡</Text>
              <View style={styles.emptyPadRule} />
            </View>
          ))}
        </View>
      ) : (
        <View testID="tbr-list" style={styles.tbrPaper}>
          {books.map((book, index) => (
            <View key={book.id} style={styles.tbrEntry}>
              <Text
                accessibilityLabel={`TBR marker: ${book.categories[0] ?? 'Uncategorized'}`}
                style={[styles.heartMarker, { color: colorForCategory(book.categories[0] ?? 'Uncategorized', categoryColors) }]}
              >
                ♡
              </Text>
              <View style={styles.tbrEntryContent}>
                <Text testID="tbr-book-title" style={styles.bookTitle}>{book.title}</Text>
                <Text style={styles.bookAuthors}>{book.authors.join(', ') || 'Author not listed'}</Text>
                <BookMetadata book={book} missingPageCountLabel="Page count not set" />
                <View style={[styles.actionRow, styles.tbrActions]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${book.title} up`}
                    disabled={index === 0}
                    onPress={() => void moveBook(book.id, -1)}
                    style={[styles.smallButton, index === 0 && styles.disabledButton]}
                  >
                    <Text style={styles.smallButtonText}>↑</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${book.title} down`}
                    disabled={index === books.length - 1}
                    onPress={() => void moveBook(book.id, 1)}
                    style={[styles.smallButton, index === books.length - 1 && styles.disabledButton]}
                  >
                    <Text style={styles.smallButtonText}>↓</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${book.title}`}
                    onPress={() => setEditor({ mode: 'edit', initialBook: book })}
                    style={styles.smallButton}
                  >
                    <Text style={styles.smallButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${book.title} from TBR`}
                    onPress={() => void removeBook(book.id)}
                    style={styles.smallButton}
                  >
                    <Text style={styles.removeButtonText}>Remove from TBR</Text>
                  </Pressable>
                </View>
                <View style={styles.ruledLine} />
              </View>
            </View>
          ))}
          <View accessibilityLabel="Book category color key" style={styles.categoryLegend}>
            {getListCategories(books).map((category) => (
              <View key={category} style={styles.categoryLegendItem}>
                <Text style={[styles.legendHeart, { color: colorForCategory(category, categoryColors) }]}>♥</Text>
                <Text style={styles.legendLabel}>{category}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function BookEditor({ initialBook, isSaving, mode, onCancel, onSave }: BookEditorProps) {
  const labels = editorLabels[mode];
  const [title, setTitle] = useState(initialBook.title);
  const [authors, setAuthors] = useState(initialBook.authors.join(', '));
  const [coverUrl, setCoverUrl] = useState(initialBook.coverUrl ?? '');
  const [categories, setCategories] = useState(initialBook.categories.join(', '));
  const [pageCount, setPageCount] = useState(initialBook.pageCount?.toString() ?? '');
  const [description, setDescription] = useState(initialBook.description ?? '');
  const [error, setError] = useState<string | null>(null);

  async function chooseCover() {
    try {
      const image = await pickBookImage();
      if (image) setCoverUrl(image);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The cover image could not be opened.');
    }
  }

  function submit() {
    const normalizedTitle = title.trim();
    const normalizedPageCount = pageCount.trim() ? Number(pageCount) : null;
    if (!normalizedTitle) {
      setError('Enter a book title.');
      return;
    }
    if (normalizedPageCount !== null && (!Number.isInteger(normalizedPageCount) || normalizedPageCount < 1)) {
      setError('Page count must be a positive whole number.');
      return;
    }

    setError(null);
    onSave({
      ...initialBook,
      title: normalizedTitle,
      authors: splitValues(authors),
      coverUrl: coverUrl.trim() || null,
      categories: splitValues(categories),
      pageCount: normalizedPageCount,
      description: description.trim() || null,
    });
  }

  return (
    <View style={styles.editor} testID="book-editor">
      <Text style={styles.listTitle}>{labels.heading}</Text>
      <EditorField label="Book title" value={title} onChangeText={setTitle} />
      <EditorField label="Authors" value={authors} onChangeText={setAuthors} placeholder="Separate names with commas" />
      <EditorField label="Categories" value={categories} onChangeText={setCategories} placeholder="Separate categories with commas" />
      <EditorField label="Page count" value={pageCount} onChangeText={setPageCount} keyboardType="number-pad" />
      <Text style={styles.fieldLabel}>Book cover · JPG, JPEG, or PNG</Text>
      <BookCover book={{ ...initialBook, title, coverUrl: coverUrl || null }} />
      <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void chooseCover()} style={styles.manualButton}>
        <Text style={styles.manualButtonText}>{coverUrl ? 'Choose a different cover image' : 'Upload cover image'}</Text>
      </Pressable>
      <EditorField label="Description" value={description} onChangeText={setDescription} multiline />
      {error ? <Text accessibilityRole="alert" style={styles.message}>{error}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" disabled={isSaving} onPress={submit} style={styles.primaryButton}>
          {isSaving ? <ActivityIndicator color={colors.panel} /> : <Text style={styles.primaryButtonText}>{labels.submit}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={isSaving} onPress={onCancel} style={styles.manualButton}>
          <Text style={styles.manualButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TbrCategorySettings({ repository, onCategoriesChanged }: { repository: TbrRepository; onCategoriesChanged(): void }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [isSavingCategory, setIsSavingCategory] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [books, savedColors] = await Promise.all([repository.list(), repository.listCategoryColors()]);
      setCategories(getListCategories(books));
      setCategoryColors(savedColors);
      setMessage(null);
    } catch {
      setMessage('Book category colors could not be loaded. Try again.');
    }
  }, [repository]);

  useEffect(() => { void load(); }, [load]);

  async function saveColor(category: string, color: string) {
    setIsSavingCategory(category);
    setMessage(null);
    try {
      await repository.setCategoryColor(category, color);
      setCategoryColors((current) => ({ ...current, [categoryKey(category)]: color }));
      onCategoriesChanged();
    } catch {
      setMessage(`The ${category} color could not be saved.`);
    } finally {
      setIsSavingCategory(null);
    }
  }

  return (
    <View style={styles.editor} testID="tbr-category-settings">
      <Text style={styles.listTitle}>Book category colors</Text>
      <Text style={styles.bookMetadata}>Choose the heart color shown beside each TBR category.</Text>
      {categories.length === 0 ? <Text style={styles.bookMetadata}>Add a Book with a category to customize its color.</Text> : null}
      {categories.map((category) => (
        <View key={category} style={styles.categorySettingsRow}>
          <Text style={[styles.legendHeart, { color: colorForCategory(category, categoryColors) }]}>♥</Text>
          <Text style={styles.legendLabel}>{category}</Text>
          <View style={styles.categoryColorChoices}>
            {[...new Set([colorForCategory(category, categoryColors), ...categoryPalette])].map((color) => (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={`Set ${category} color to ${color}`}
                accessibilityState={{ selected: colorForCategory(category, categoryColors) === color }}
                disabled={isSavingCategory !== null}
                onPress={() => void saveColor(category, color)}
                style={[styles.categoryColorSwatch, { backgroundColor: color }, colorForCategory(category, categoryColors) === color && styles.selectedCategoryColorSwatch]}
              />
            ))}
          </View>
        </View>
      ))}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    </View>
  );
}

function EditorField({
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: 'default' | 'number-pad' | 'url';
  label: string;
  multiline?: boolean;
  onChangeText(value: string): void;
  placeholder?: string;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  );
}

function BookCover({ book }: { book: BookDraft }) {
  const accessibilityLabel = `Cover of ${book.title}`;

  return book.coverUrl ? (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={accessibilityLabel}
      source={{ uri: book.coverUrl }}
      style={styles.cover}
    />
  ) : (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[styles.cover, styles.coverPlaceholder]}
    >
      <Text style={styles.coverInitial}>{book.title.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function BookMetadata({ book, missingPageCountLabel }: { book: BookDraft; missingPageCountLabel: string }) {
  return (
    <>
      {book.categories.length ? <Text style={styles.bookMetadata}>{book.categories.join(' · ')}</Text> : null}
      <Text style={styles.bookMetadata}>{book.pageCount ? `${book.pageCount} pages` : missingPageCountLabel}</Text>
    </>
  );
}

function getListCategories(books: TbrBook[]): string[] {
  return [...new Set(books.flatMap((book) => book.categories.length ? book.categories : ['Uncategorized']))];
}

function categoryKey(category: string): string {
  return category.trim().toLowerCase();
}

function colorForCategory(category: string, savedColors: Record<string, string>): string {
  const key = categoryKey(category);
  if (savedColors[key]) return savedColors[key];
  const hash = [...key].reduce((value, character) => value + character.charCodeAt(0), 0);
  return categoryPalette[hash % categoryPalette.length];
}

function splitValues(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const styles = StyleSheet.create({
  container: { marginTop: 20 },
  sectionTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 40, textAlign: 'center' },
  sectionHint: { color: colors.muted, fontSize: 14, marginTop: 6, textAlign: 'center' },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 24 },
  searchInput: { flex: 1 },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  primaryButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 12, justifyContent: 'center', minHeight: 48, minWidth: 88, paddingHorizontal: 16 },
  primaryButtonText: { color: colors.panel, fontSize: 14, fontWeight: '700' },
  manualButton: { alignItems: 'center', borderColor: colors.olive, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44, marginTop: 10, paddingHorizontal: 16 },
  manualButtonText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  message: { color: colors.error, fontSize: 13, lineHeight: 19, marginTop: 10 },
  resultsSection: { marginTop: 20 },
  listTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 23, marginBottom: 10, marginTop: 22 },
  bookCard: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 14, marginBottom: 12, padding: 12 },
  cover: { backgroundColor: colors.pale, borderColor: colors.line, borderRadius: 8, borderWidth: 1, height: 112, width: 76 },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  coverInitial: { color: colors.olive, fontFamily: 'Georgia', fontSize: 30 },
  bookDetails: { flex: 1, justifyContent: 'center' },
  bookTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 17, lineHeight: 22 },
  bookAuthors: { color: colors.ink, fontSize: 14, marginTop: 5 },
  bookMetadata: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  tbrPaper: { alignSelf: 'center', backgroundColor: '#FFF9E7', borderColor: '#EEE6CE', borderRadius: 24, borderWidth: 1, marginBottom: 18, marginTop: 4, maxWidth: 820, paddingHorizontal: 24, paddingVertical: 16, width: '100%' },
  emptyPadHint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 4, textAlign: 'center' },
  emptyPadEntry: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 38 },
  emptyPadHeart: { color: '#AAA48F', fontSize: 23, textAlign: 'center', width: 26 },
  emptyPadRule: { borderBottomColor: '#A7A28E', borderBottomWidth: StyleSheet.hairlineWidth, flex: 1, height: 20 },
  tbrEntry: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, paddingTop: 14 },
  heartMarker: { fontSize: 25, lineHeight: 32, marginTop: 1, textAlign: 'center', width: 26 },
  tbrEntryContent: { flex: 1, minWidth: 0 },
  tbrActions: { marginTop: 8 },
  ruledLine: { borderBottomColor: '#A7A28E', borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 11 },
  categoryLegend: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', paddingBottom: 8, paddingTop: 22 },
  categoryLegendItem: { alignItems: 'center', flexDirection: 'row', gap: 4, maxWidth: '100%' },
  selectedCategoryLegendItem: { backgroundColor: '#F0EDDF', borderRadius: 8, paddingHorizontal: 4 },
  legendHeart: { fontSize: 20, lineHeight: 22 },
  legendLabel: { color: colors.ink, fontSize: 12 },
  categoryColorEditor: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginBottom: 8, marginTop: 8, paddingTop: 10 },
  categoryColorHeading: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  categoryColorChoices: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  categorySettingsRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingVertical: 12 },
  categoryColorSwatch: { borderColor: colors.line, borderRadius: 14, borderWidth: 1, height: 28, width: 28 },
  selectedCategoryColorSwatch: { borderColor: colors.ink, borderWidth: 3 },
  smallButton: { alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 40, paddingHorizontal: 10 },
  disabledButton: { opacity: 0.48 },
  smallButtonText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  removeButtonText: { color: colors.error, fontSize: 12, fontWeight: '600' },
  actionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  editor: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 18 },
  field: { marginBottom: 12 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  multilineInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 18 },
});
