import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { getColors } from 'react-native-image-colors';

import type { BookshelfBook, BookshelfDecoration, BookshelfRepository, ShelfOrientation } from '../../books/bookshelfTypes';
import { prominentCoverColor, textColorOnSpine } from '../../books/coverColor';
import { journalColors as colors } from '../../theme/colors';

interface BookshelfScreenProps {
  repository: BookshelfRepository;
  refreshToken: number;
}

const spinePalette = ['#82876A', '#887668', '#B78373', '#9A7181', '#66798A', '#C5A864', '#6D634A', '#9B9A81'];

export function BookshelfScreen({ refreshToken, repository }: BookshelfScreenProps) {
  const { width } = useWindowDimensions();
  const boardWidth = Math.min(1000, Math.max(320, width - 44));
  const [books, setBooks] = useState<BookshelfBook[]>([]);
  const [decorations, setDecorations] = useState<BookshelfDecoration[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedDecorationId, setSelectedDecorationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colorLookups = useRef(new Set<string>());

  const deriveSpineColors = useCallback((shelfBooks: BookshelfBook[]) => {
    for (const item of shelfBooks) {
      const coverUrl = item.book.coverUrl;
      if (!coverUrl || item.isColorCustomized) continue;
      const lookupKey = `${item.book.id}:${coverUrl}`;
      if (colorLookups.current.has(lookupKey)) continue;
      colorLookups.current.add(lookupKey);

      void getColors(coverUrl, { fallback: item.spineColor, cache: true, key: lookupKey })
        .then(async (palette) => {
          const color = prominentCoverColor(palette);
          if (!color || color.toLowerCase() === item.spineColor.toLowerCase()) return;
          const saved = await repository.setDefaultSpineColor(item.book.id, color);
          if (saved) {
            setBooks((current) => current.map((entry) => entry.book.id === item.book.id && !entry.isColorCustomized
              ? { ...entry, spineColor: color }
              : entry));
          }
        })
        .catch(() => { colorLookups.current.delete(lookupKey); });
    }
  }, [repository]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const shelf = await repository.load();
      setBooks(shelf.books);
      setDecorations(shelf.decorations);
      deriveSpineColors(shelf.books);
      setError(null);
    } catch {
      setError('Your digital bookshelf could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, [deriveSpineColors, repository]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const selectedBook = books.find(({ book }) => book.id === selectedBookId) ?? null;
  const selectedDecoration = decorations.find(({ id }) => id === selectedDecorationId) ?? null;
  const canvasHeight = useMemo(() => Math.max(540, ...books.map((book) => book.y + 330), ...decorations.map((item) => item.y + 200)), [books, decorations]);

  async function changeOrientation(orientation: ShelfOrientation) {
    if (!selectedBook) return;
    try {
      await repository.setOrientation(selectedBook.book.id, orientation);
      setBooks((current) => current.map((item) => item.book.id === selectedBook.book.id ? { ...item, orientation } : item));
    } catch {
      setError('The book position could not be saved.');
    }
  }

  async function changeColor(color: string) {
    if (!selectedBook) return;
    try {
      await repository.setSpineColor(selectedBook.book.id, color);
      setBooks((current) => current.map((item) => item.book.id === selectedBook.book.id ? { ...item, spineColor: color, isColorCustomized: true } : item));
    } catch {
      setError('The book color could not be saved.');
    }
  }

  async function addDecoration(kind: 'plant' | 'frame') {
    try {
      await repository.addDecoration(kind);
      await load();
    } catch {
      setError('The decoration could not be added.');
    }
  }

  async function removeDecoration() {
    if (!selectedDecoration) return;
    try {
      await repository.removeDecoration(selectedDecoration.id);
      setDecorations((current) => current.filter((item) => item.id !== selectedDecoration.id));
      setSelectedDecorationId(null);
    } catch {
      setError('The decoration could not be removed.');
    }
  }

  return (
    <View style={styles.container} testID="digital-bookshelf">
      <Text style={styles.pageTitle}>My Bookshelf</Text>
      <Text style={styles.pageIntro}>Every finished Book joins your shelf. Touch and drag books or decorations to make the arrangement yours.</Text>
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" onPress={() => void addDecoration('plant')} style={styles.toolButton}><Text style={styles.toolText}>＋ Plant</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void addDecoration('frame')} style={styles.toolButton}><Text style={styles.toolText}>＋ Frame</Text></Pressable>
      </View>
      {selectedBook ? (
        <View style={styles.selectionPanel}>
          <Text style={styles.selectionTitle}>{selectedBook.book.title}</Text>
          <Text style={styles.selectionLabel}>Book orientation</Text>
          <View style={styles.toolbar}>
            {(['upright', 'tilted', 'horizontal'] as const).map((orientation) => (
              <Pressable key={orientation} accessibilityRole="button" accessibilityState={{ selected: selectedBook.orientation === orientation }} onPress={() => void changeOrientation(orientation)} style={[styles.toolButton, selectedBook.orientation === orientation && styles.selectedTool]}>
                <Text style={styles.toolText}>{capitalize(orientation)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.selectionLabel}>Spine color</Text>
          <View style={styles.toolbar}>
            {[...new Set([selectedBook.spineColor, ...spinePalette])].map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Set ${selectedBook.book.title} spine color to ${color}`} onPress={() => void changeColor(color)} style={[styles.colorSwatch, { backgroundColor: color }, selectedBook.spineColor.toLowerCase() === color.toLowerCase() && styles.selectedSwatch]} />)}
          </View>
        </View>
      ) : selectedDecoration ? (
        <View style={styles.selectionPanel}>
          <Text style={styles.selectionTitle}>{selectedDecoration.kind === 'plant' ? 'Small plant' : 'Picture frame'}</Text>
          <Pressable accessibilityRole="button" onPress={() => void removeDecoration()} style={styles.removeButton}><Text style={styles.removeText}>Remove decoration</Text></Pressable>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={colors.olive} style={styles.loader} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!loading && books.length === 0 && decorations.length === 0 ? <Text style={styles.emptyState}>Finish a Book to place it here. Add a plant or frame whenever you like.</Text> : null}
      <ScrollView style={styles.scroller} contentContainerStyle={{ height: canvasHeight, width: boardWidth }} testID="bookshelf-scroll-view">
        {Array.from({ length: Math.ceil(canvasHeight / 270) }, (_, index) => <View key={index} pointerEvents="none" style={[styles.shelfLine, { top: index * 270 + 244, width: boardWidth - 20 }]} />)}
        {books.map((item) => (
          <DraggableShelfItem
            key={item.book.id}
            accessibilityLabel={`Shelf item ${item.book.title}`}
            boardWidth={boardWidth}
            initialX={item.x}
            initialY={item.y}
            onError={() => setError('The book position could not be saved.')}
            onDrop={async (x, y) => {
              await repository.moveBook(item.book.id, x, y);
              setBooks((current) => current.map((entry) => entry.book.id === item.book.id ? { ...entry, x, y } : entry));
            }}
            onPress={() => { setSelectedBookId(item.book.id); setSelectedDecorationId(null); }}
            selected={selectedBookId === item.book.id}
          >
            <BookSpine book={item} />
          </DraggableShelfItem>
        ))}
        {decorations.map((item) => (
          <DraggableShelfItem
            key={item.id}
            accessibilityLabel={`Shelf decoration ${item.kind === 'plant' ? 'Small plant' : 'Picture frame'}`}
            boardWidth={boardWidth}
            initialX={item.x}
            initialY={item.y}
            onError={() => setError('The decoration position could not be saved.')}
            onDrop={(x, y) => repository.moveDecoration(item.id, x, y)}
            onPress={() => { setSelectedDecorationId(item.id); setSelectedBookId(null); }}
            selected={selectedDecorationId === item.id}
          >
            <Text style={styles.decoration}>{item.kind === 'plant' ? '🪴' : '🖼️'}</Text>
          </DraggableShelfItem>
        ))}
      </ScrollView>
      <Text style={styles.shelfCount}>{books.length} Books · {decorations.length} decorations</Text>
    </View>
  );
}

function BookSpine({ book }: { book: BookshelfBook }) {
  const width = Math.max(36, Math.min(72, (book.book.pageCount ?? 300) * 0.095));
  return (
    <View testID={`book-spine-${book.book.id}`} style={[styles.bookSpine, { backgroundColor: book.spineColor, width }, orientationStyle(book.orientation)]}>
      <Text numberOfLines={4} style={[styles.spineTitle, { color: textColorOnSpine(book.spineColor) }, book.orientation === 'horizontal' && styles.horizontalTitle]}>{book.book.title}</Text>
      <View style={styles.spineMark}><Text style={styles.spineMarkText}>{book.book.pageCount ?? '·'}</Text></View>
    </View>
  );
}

function DraggableShelfItem({
  boardWidth,
  accessibilityLabel,
  children,
  initialX,
  initialY,
  onError,
  onDrop,
  onPress,
  selected,
}: {
  boardWidth: number;
  accessibilityLabel: string;
  children: React.ReactNode;
  initialX: number;
  initialY: number;
  onError(): void;
  onDrop(x: number, y: number): Promise<void>;
  onPress(): void;
  selected: boolean;
}) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const positionRef = React.useRef({ x: initialX, y: initialY });
  const start = React.useRef({ x: initialX, y: initialY });
  const moved = React.useRef(false);
  const handlersRef = React.useRef({ onDrop, onPress, onError });
  handlersRef.current = { onDrop, onPress, onError };
  useEffect(() => {
    const next = { x: initialX, y: initialY };
    positionRef.current = next;
    setPosition(next);
  }, [initialX, initialY]);
  const responder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      start.current = positionRef.current;
      moved.current = false;
    },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5) moved.current = true;
      const next = {
        x: Math.min(0.95, Math.max(0, start.current.x + gesture.dx / boardWidth)),
        y: Math.max(0, start.current.y + gesture.dy),
      };
      positionRef.current = next;
      setPosition(next);
    },
    onPanResponderRelease: () => {
      if (moved.current) {
        void handlersRef.current.onDrop(positionRef.current.x, positionRef.current.y).catch(handlersRef.current.onError);
      } else handlersRef.current.onPress();
    },
  }), [boardWidth]);

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onAccessibilityTap={onPress}
      {...responder.panHandlers}
      style={[styles.draggable, { left: position.x * boardWidth, top: position.y }, selected && styles.selectedItem]}
    >
      {children}
    </View>
  );
}

function orientationStyle(orientation: ShelfOrientation) {
  if (orientation === 'tilted') return { transform: [{ rotate: '-8deg' }] } as const;
  if (orientation === 'horizontal') return { height: 70, transform: [{ rotate: '90deg' }] } as const;
  return {};
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  container: { marginTop: 20 },
  pageTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 32 },
  pageIntro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  toolButton: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 13 },
  toolText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  selectedTool: { backgroundColor: '#E9E8DA', borderColor: colors.olive },
  selectionPanel: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14 },
  selectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 19 },
  selectionLabel: { color: colors.muted, fontSize: 12, marginTop: 12 },
  colorSwatch: { borderColor: colors.line, borderRadius: 14, borderWidth: 1, height: 28, width: 28 },
  selectedSwatch: { borderColor: colors.ink, borderWidth: 3 },
  removeButton: { alignSelf: 'flex-start', backgroundColor: '#FAECE7', borderColor: '#C48A7C', borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 40, paddingHorizontal: 12 },
  removeText: { color: '#8B3F32', fontSize: 13, fontWeight: '600' },
  scroller: { backgroundColor: '#F0EDDF', borderColor: colors.line, borderRadius: 18, borderWidth: 1, marginTop: 18, maxHeight: 720, overflow: 'hidden' },
  shelfLine: { backgroundColor: '#B1AA92', height: 10, left: 10, position: 'absolute', shadowColor: '#8B8067', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.3, shadowRadius: 3 },
  draggable: { alignItems: 'center', justifyContent: 'flex-end', position: 'absolute', zIndex: 2 },
  selectedItem: { borderColor: colors.olive, borderRadius: 6, borderWidth: 2, padding: 2 },
  bookSpine: { alignItems: 'center', borderColor: '#5A5746', borderRadius: 5, borderWidth: 1, height: 204, justifyContent: 'center', overflow: 'hidden', padding: 4 },
  spineTitle: { color: '#FFFCF2', fontFamily: 'Georgia', fontSize: 13, fontWeight: '700', textAlign: 'center', textShadowColor: '#3C392E', textShadowRadius: 3 },
  horizontalTitle: { fontSize: 12 },
  spineMark: { backgroundColor: '#FFFCF2AA', borderRadius: 8, bottom: 4, paddingHorizontal: 4, position: 'absolute' },
  spineMarkText: { color: colors.ink, fontSize: 9 },
  decoration: { fontSize: 58, textAlign: 'center' },
  emptyState: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14, padding: 18 },
  shelfCount: { color: colors.muted, fontSize: 12, marginTop: 8 },
  loader: { marginVertical: 12 },
  error: { color: colors.error, marginTop: 10 },
});
