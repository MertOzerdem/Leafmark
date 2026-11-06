import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { getColors } from 'react-native-image-colors';

import type { BookshelfBook, BookshelfDecoration, BookshelfRepository, ShelfOrientation } from '../../books/bookshelfTypes';
import { prominentCoverColor, textColorOnSpine } from '../../books/coverColor';
import { journalColors as colors } from '../../theme/colors';

interface BookshelfScreenProps {
  repository: BookshelfRepository;
  refreshToken: number;
}

const spinePalette = ['#82876A', '#887668', '#B78373', '#9A7181', '#66798A', '#C5A864', '#6D634A', '#9B9A81'];
const categoryPalette = ['#88758B', '#C995AA', '#8491A1', '#A0A774', '#C0A36F'];
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1100;
const LEGACY_CANVAS_HEIGHT = 1350;
const SHELF_SUPPORTS = [140, 270, 400, 530, 660, 790, 920, 1050];
const CASE_MARGIN = 30;

export function BookshelfScreen({ refreshToken, repository }: BookshelfScreenProps) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [books, setBooks] = useState<BookshelfBook[]>([]);
  const [decorations, setDecorations] = useState<BookshelfDecoration[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedDecorationId, setSelectedDecorationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colorLookups = useRef(new Set<string>());
  const scale = viewport.width > 0 && viewport.height > 0
    ? Math.min(viewport.width / DESIGN_WIDTH, viewport.height / DESIGN_HEIGHT)
    : 0;
  const boardWidth = DESIGN_WIDTH * scale;
  const boardHeight = DESIGN_HEIGHT * scale;

  function measureViewport(event: LayoutChangeEvent) {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setViewport((current) => current.width === nextWidth && current.height === nextHeight
      ? current
      : { width: nextWidth, height: nextHeight });
  }

  const deriveSpineColors = useCallback((shelfBooks: BookshelfBook[]) => {
    for (const item of shelfBooks) {
      const coverUrl = item.book.coverUrl;
      if (!coverUrl || item.isColorCustomized) continue;
      const lookupKey = `${item.book.id}:${coverUrl}`;
      if (colorLookups.current.has(lookupKey)) continue;
      colorLookups.current.add(lookupKey);

      void getColors(coverUrl, { fallback: item.spineColor, cache: true, key: lookupKey })
        .then(async (palette) => {
          if (palette.platform === 'android') return;
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
      const designBooks = shelf.books.map((book) => ({ ...book, y: toDesignY(book.y) }));
      setBooks(settleBooks(designBooks));
      setDecorations(shelf.decorations.map((item) => ({
        ...item,
        x: clamp(item.x, 0, 1 - 86 / DESIGN_WIDTH),
        y: clamp(toDesignY(item.y), 0, DESIGN_HEIGHT - 86),
      })));
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
  const categories = useMemo(
    () => [...new Set(books.flatMap((item) => item.book.categories))],
    [books],
  );

  async function changeOrientation(orientation: ShelfOrientation) {
    if (!selectedBook) return;
    try {
      const changedBook = { ...selectedBook, orientation };
      const position = findBookPlacement(changedBook, selectedBook.x, selectedBook.y, books.filter(({ book }) => book.id !== selectedBook.book.id));
      if (!position) {
        setError('There is not enough room on the shelf for this orientation. Move another Book first.');
        return;
      }
      await repository.setOrientation(selectedBook.book.id, orientation);
      await repository.moveBook(selectedBook.book.id, position.x, toStoredY(position.y));
      setBooks((current) => current.map((item) => item.book.id === selectedBook.book.id ? { ...item, orientation, ...position } : item));
    } catch {
      setError('The book position could not be saved.');
    }
  }

  async function moveBook(bookId: string, x: number, y: number) {
    const book = books.find(({ book: item }) => item.id === bookId);
    if (!book) return;
    const position = findBookPlacement(book, x, y, books.filter(({ book: item }) => item.id !== bookId));
    if (!position) {
      setError('There is not enough room on the bookshelf. Move another Book first.');
      return;
    }
    await repository.moveBook(bookId, position.x, toStoredY(position.y));
    setBooks((current) => current.map((item) => item.book.id === bookId ? { ...item, ...position } : item));
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

  function closeSelection() {
    setSelectedBookId(null);
    setSelectedDecorationId(null);
  }

  return (
    <View style={styles.container} testID="digital-bookshelf">
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.pageTitle}>My Bookshelf</Text>
          <Text style={styles.pageIntro}>{books.length || decorations.length ? `${books.length} Books · ${decorations.length} decorations · Drag to arrange` : 'Finish a Book to place it here.'}</Text>
        </View>
        <View style={styles.toolbar}>
          <Pressable accessibilityRole="button" onPress={() => void addDecoration('plant')} style={styles.toolButton}><Text style={styles.toolText}>＋ Plant</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void addDecoration('frame')} style={styles.toolButton}><Text style={styles.toolText}>＋ Frame</Text></Pressable>
        </View>
      </View>
      {categories.length > 0 ? (
        <ScrollView accessibilityLabel="Book category color key" horizontal showsHorizontalScrollIndicator={false} style={styles.categoryLegendScroll} contentContainerStyle={styles.categoryLegend}>
          {categories.map((category) => (
            <View key={category} style={styles.categoryLegendItem}>
              <Text style={[styles.categoryHeart, { color: colorForCategory(category) }]}>♥</Text>
              <Text style={styles.categoryLabel}>{category}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {loading ? <ActivityIndicator color={colors.olive} style={styles.loader} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View onLayout={measureViewport} style={styles.shelfZone}>
        {scale > 0 ? <View style={[styles.board, { height: boardHeight, width: boardWidth }]} testID="bookshelf-board">
          <View pointerEvents="none" style={[styles.caseTopRail, { height: 14 * scale, left: 16 * scale, top: 10 * scale, width: boardWidth - 32 * scale }]} />
          <View pointerEvents="none" style={[styles.caseLeftRail, { bottom: 0, left: 8 * scale, top: 0, width: 14 * scale }]} />
          <View pointerEvents="none" style={[styles.caseRightRail, { bottom: 0, right: 8 * scale, top: 0, width: 14 * scale }]} />
          <View pointerEvents="none" style={[styles.caseDivider, { left: boardWidth / 3, top: 0, bottom: 0, width: 7 * scale }]} />
          <View pointerEvents="none" style={[styles.caseDivider, { left: boardWidth * 2 / 3, top: 0, bottom: 0, width: 7 * scale }]} />
          {SHELF_SUPPORTS.map((support) => <View key={support} pointerEvents="none" style={[styles.shelfLine, { height: 12 * scale, left: 15 * scale, top: support * scale, width: boardWidth - 30 * scale }]} />)}
          <View pointerEvents="none" style={[styles.caseBottomRail, { height: 16 * scale, left: 15 * scale, top: boardHeight - 24 * scale, width: boardWidth - 30 * scale }]} />
          {books.map((item) => {
            const dimensions = spineDimensions(item);
            return <DraggableShelfItem
              key={item.book.id}
              accessibilityLabel={`Shelf item ${item.book.title}`}
              boardHeight={boardHeight}
              boardWidth={boardWidth}
              designScale={scale}
              itemHeight={dimensions.height}
              itemWidth={dimensions.width}
              initialX={item.x}
              initialY={item.y}
              onError={() => setError('The book position could not be saved.')}
              onDrop={(x, y) => moveBook(item.book.id, x, y)}
              onPress={() => { setSelectedBookId(item.book.id); setSelectedDecorationId(null); }}
              selected={selectedBookId === item.book.id}
            >
              <BookSpine book={item} scale={scale} />
            </DraggableShelfItem>;
          })}
          {decorations.map((item) => (
            <DraggableShelfItem
              key={item.id}
              accessibilityLabel={`Shelf decoration ${item.kind === 'plant' ? 'Small plant' : 'Picture frame'}`}
              boardHeight={boardHeight}
              boardWidth={boardWidth}
              designScale={scale}
              itemHeight={86}
              itemWidth={86}
              initialX={item.x}
              initialY={item.y}
              onError={() => setError('The decoration position could not be saved.')}
              onDrop={async (x, y) => {
                await repository.moveDecoration(item.id, x, toStoredY(y));
                setDecorations((current) => current.map((entry) => entry.id === item.id ? { ...entry, x, y } : entry));
              }}
              onPress={() => { setSelectedDecorationId(item.id); setSelectedBookId(null); }}
              selected={selectedDecorationId === item.id}
            >
              <Text style={[styles.decoration, { fontSize: Math.max(22, 58 * scale), lineHeight: Math.max(26, 66 * scale) }]}>{item.kind === 'plant' ? '🪴' : '🖼️'}</Text>
            </DraggableShelfItem>
          ))}
        </View> : null}
      </View>
      <Modal animationType="fade" onRequestClose={closeSelection} transparent visible={Boolean(selectedBook || selectedDecoration)}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close bookshelf settings" onPress={closeSelection} style={styles.modalScrim} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.selectionTitle}>{selectedBook?.book.title ?? (selectedDecoration?.kind === 'plant' ? 'Small plant' : 'Picture frame')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close bookshelf settings" onPress={closeSelection} style={styles.closeButton}><Text style={styles.closeButtonText}>×</Text></Pressable>
            </View>
            {selectedBook ? <>
              <Text style={styles.selectionLabel}>Orientation</Text>
              <View style={styles.selectionOptions}>
                {(['upright', 'tilted', 'horizontal'] as const).map((orientation) => (
                  <Pressable key={orientation} accessibilityRole="button" accessibilityState={{ selected: selectedBook.orientation === orientation }} onPress={() => void changeOrientation(orientation)} style={[styles.toolButton, selectedBook.orientation === orientation && styles.selectedTool]}>
                    <Text style={styles.toolText}>{capitalize(orientation)}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.selectionLabel, styles.colorLabel]}>Spine color</Text>
              <View style={styles.colorOptions}>
                {[...new Set([selectedBook.spineColor, ...spinePalette])].map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Set ${selectedBook.book.title} spine color to ${color}`} onPress={() => void changeColor(color)} style={[styles.colorSwatch, { backgroundColor: color }, selectedBook.spineColor.toLowerCase() === color.toLowerCase() && styles.selectedSwatch]} />)}
              </View>
            </> : <Pressable accessibilityRole="button" onPress={() => void removeDecoration()} style={styles.removeButton}><Text style={styles.removeText}>Remove decoration</Text></Pressable>}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function BookSpine({ book, scale }: { book: BookshelfBook; scale: number }) {
  const dimensions = spineDimensions(book);
  const height = dimensions.height * scale;
  const width = dimensions.width * scale;
  const isHorizontal = book.orientation === 'horizontal';
  const titleWidth = isHorizontal ? width - 38 * scale : height - 40 * scale;
  return (
    <View testID={`book-spine-${book.book.id}`} style={[styles.bookSpine, { backgroundColor: book.spineColor, height, width }, book.orientation === 'tilted' && styles.tiltedSpine]}>
      <Text
        testID={`spine-title-${book.book.id}`}
        numberOfLines={isHorizontal ? 2 : 1}
        ellipsizeMode="tail"
        style={[
          styles.spineTitle,
          {
            color: textColorOnSpine(book.spineColor),
            width: titleWidth,
            maxWidth: titleWidth,
            flexShrink: 0,
            left: isHorizontal ? 10 * scale : (width - titleWidth) / 2,
            top: (height - 20 * scale) / 2,
            fontSize: Math.max(8, 12 * scale),
            height: 20 * scale,
            lineHeight: 20 * scale,
          },
          isHorizontal
            ? [styles.horizontalTitle, { fontSize: Math.max(8, 11 * scale), lineHeight: Math.max(9, 14 * scale) }]
            : styles.verticalSpineTitle,
        ]}
      >
        {book.book.title}
      </Text>
      <View style={[styles.spineMark, { bottom: 4 * scale, borderRadius: 8 * scale, paddingHorizontal: 4 * scale, right: isHorizontal ? 3 * scale : undefined }, isHorizontal && styles.horizontalSpineMark]}><Text style={[styles.spineMarkText, { fontSize: Math.max(6, 9 * scale) }]}>{book.book.pageCount ?? '·'}</Text></View>
    </View>
  );
}

function spineDimensions(book: BookshelfBook): { width: number; height: number } {
  const thickness = Math.max(34, Math.min(76, 28 + (book.book.pageCount ?? 300) * 0.12));
  return book.orientation === 'horizontal' ? { width: 204, height: thickness } : { width: thickness, height: 116 };
}

function bookFootprint(book: BookshelfBook) {
  const { width, height } = spineDimensions(book);
  const radians = book.orientation === 'tilted' ? Math.PI / 24 : 0;
  const footprintWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
  const footprintHeight = Math.abs(height * Math.cos(radians)) + Math.abs(width * Math.sin(radians));
  return { width, height, footprintWidth, footprintHeight, extraX: (footprintWidth - width) / 2, extraY: (footprintHeight - height) / 2 };
}

function settleBooks(books: BookshelfBook[]): BookshelfBook[] {
  const placed: BookshelfBook[] = [];
  const ordered = [...books].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const book of ordered) {
    const position = findBookPlacement(book, book.x, book.y, placed);
    placed.push(position ? { ...book, ...position } : book);
  }
  return books.map((book) => placed.find((item) => item.book.id === book.book.id) ?? book);
}

function findBookPlacement(book: BookshelfBook, targetX: number, targetY: number, others: BookshelfBook[]): { x: number; y: number } | null {
  const footprint = bookFootprint(book);
  const rows = [...SHELF_SUPPORTS].sort((left, right) =>
    Math.abs(left - (targetY + footprint.height + footprint.extraY)) - Math.abs(right - (targetY + footprint.height + footprint.extraY)),
  );

  for (const support of rows) {
    const y = support - footprint.height - footprint.extraY;
    if (y - footprint.extraY < 0 || support > DESIGN_HEIGHT - 24) continue;
    const rowBooks = others.filter((other) => {
      const otherFootprint = bookFootprint(other);
      return Math.abs(other.y + otherFootprint.height + otherFootprint.extraY - support) < 3;
    });
    const minX = CASE_MARGIN + footprint.extraX;
    const maxX = DESIGN_WIDTH - CASE_MARGIN - footprint.width - footprint.extraX;
    const desired = clamp(targetX * DESIGN_WIDTH, minX, maxX);
    const candidates = Array.from({ length: Math.floor((maxX - minX) / 3) + 1 }, (_, index) => minX + index * 3)
      .concat([minX, maxX, desired])
      .sort((left, right) => Math.abs(left - desired) - Math.abs(right - desired));

    for (const candidate of candidates) {
      const left = candidate - footprint.extraX;
      const right = left + footprint.footprintWidth;
      const collides = rowBooks.some((other) => {
        const otherFootprint = bookFootprint(other);
        const otherLeft = other.x * DESIGN_WIDTH - otherFootprint.extraX;
        const otherRight = otherLeft + otherFootprint.footprintWidth;
        return left < otherRight - 0.5 && right > otherLeft + 0.5;
      });
      if (!collides) return { x: candidate / DESIGN_WIDTH, y };
    }
  }
  return null;
}

function toDesignY(storedY: number): number {
  return clamp(storedY * DESIGN_HEIGHT / LEGACY_CANVAS_HEIGHT, 0, DESIGN_HEIGHT);
}

function toStoredY(designY: number): number {
  return Math.round(designY * LEGACY_CANVAS_HEIGHT / DESIGN_HEIGHT);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function DraggableShelfItem({
  boardWidth,
  boardHeight,
  designScale,
  itemHeight,
  itemWidth,
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
  boardHeight: number;
  designScale: number;
  itemHeight: number;
  itemWidth: number;
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
        x: clamp(start.current.x + gesture.dx / boardWidth, 0, Math.max(0, (boardWidth - itemWidth * designScale) / boardWidth)),
        y: clamp(start.current.y + gesture.dy / designScale, 0, Math.max(0, boardHeight / designScale - itemHeight)),
      };
      positionRef.current = next;
      setPosition(next);
    },
    onPanResponderRelease: () => {
      if (moved.current) {
        void handlersRef.current.onDrop(positionRef.current.x, positionRef.current.y).catch(handlersRef.current.onError);
      } else handlersRef.current.onPress();
    },
  }), [boardHeight, boardWidth, designScale, itemHeight, itemWidth]);

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onAccessibilityTap={onPress}
      {...responder.panHandlers}
      style={[styles.draggable, { height: itemHeight * designScale, left: position.x * boardWidth, top: position.y * designScale, width: itemWidth * designScale }, selected && styles.selectedItem]}
    >
      {children}
    </View>
  );
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

function colorForCategory(category: string): string {
  const hash = [...category.toLowerCase()].reduce((value, character) => value + character.charCodeAt(0), 0);
  return categoryPalette[hash % categoryPalette.length];
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  header: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', paddingHorizontal: 4 },
  headingCopy: { flexGrow: 1, minWidth: 180 },
  pageTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 32 },
  pageIntro: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 1 },
  categoryLegendScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 32, marginTop: 4 },
  categoryLegend: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 4 },
  categoryLegendItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  categoryHeart: { fontSize: 15, lineHeight: 18 },
  categoryLabel: { color: colors.muted, fontSize: 10 },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 0 },
  toolButton: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 32, paddingHorizontal: 9 },
  toolText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  selectedTool: { backgroundColor: '#E9E8DA', borderColor: colors.olive },
  shelfZone: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 0, width: '100%' },
  board: { backgroundColor: '#F1EDDF', borderColor: '#A99271', borderRadius: 6, borderWidth: 2, overflow: 'hidden', position: 'relative' },
  modalRoot: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 20 },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: '#24231588' },
  modalCard: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, elevation: 16, maxWidth: 460, padding: 18, shadowColor: '#403B2B', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.23, shadowRadius: 16, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 12 },
  closeButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  closeButtonText: { color: colors.ink, fontSize: 25, lineHeight: 30 },
  selectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 17 },
  selectionLabel: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  selectionOptions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  colorLabel: { marginTop: 14 },
  colorOptions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorSwatch: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, height: 24, width: 24 },
  selectedSwatch: { borderColor: colors.ink, borderWidth: 3 },
  removeButton: { alignSelf: 'flex-start', backgroundColor: '#FAECE7', borderColor: '#C48A7C', borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 40, paddingHorizontal: 12 },
  removeText: { color: '#8B3F32', fontSize: 13, fontWeight: '600' },
  caseTopRail: { backgroundColor: '#A58B68', position: 'absolute', zIndex: 1 },
  caseBottomRail: { backgroundColor: '#A58B68', position: 'absolute', zIndex: 1 },
  caseLeftRail: { backgroundColor: '#A58B68', position: 'absolute', zIndex: 1 },
  caseRightRail: { backgroundColor: '#A58B68', position: 'absolute', zIndex: 1 },
  caseDivider: { backgroundColor: '#B39A76', position: 'absolute', zIndex: 1 },
  shelfLine: { backgroundColor: '#A58B68', left: 15, position: 'absolute', shadowColor: '#6F5C43', shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.28, shadowRadius: 3, zIndex: 1 },
  draggable: { alignItems: 'center', justifyContent: 'flex-end', position: 'absolute', zIndex: 2 },
  selectedItem: { opacity: 0.9 },
  bookSpine: { alignItems: 'center', borderColor: '#5A5746', borderRadius: 4, borderWidth: 1, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 3, shadowColor: '#403B2B', shadowOffset: { height: 1, width: 2 }, shadowOpacity: 0.22, shadowRadius: 2 },
  tiltedSpine: { transform: [{ rotate: '-7deg' }] },
  spineTitle: { color: '#FFFCF2', fontFamily: 'Georgia', fontSize: 12, fontWeight: '700', height: 20, lineHeight: 20, position: 'absolute', textAlign: 'center', textShadowColor: '#3C392E', textShadowRadius: 3 },
  verticalSpineTitle: { transform: [{ rotate: '90deg' }] },
  horizontalTitle: { fontSize: 11, lineHeight: 14 },
  spineMark: { backgroundColor: '#FFFCF2AA', borderRadius: 8, bottom: 4, paddingHorizontal: 4, position: 'absolute' },
  horizontalSpineMark: { bottom: 2, right: 3 },
  spineMarkText: { color: colors.ink, fontSize: 9 },
  decoration: { fontSize: 58, textAlign: 'center' },
  loader: { marginVertical: 12 },
  error: { color: colors.error, marginTop: 10 },
});
