import type { SupabaseClient } from '@supabase/supabase-js';

import type { BookshelfBook, BookshelfDecoration, BookshelfRepository, ShelfDecorationKind, ShelfOrientation } from '../books/bookshelfTypes';
import { asRecord, bookColumns, mapBookRecord, numberValue, stringValue } from './bookMapper';

export function createBookshelfRepository(client: SupabaseClient): BookshelfRepository {
  return {
    async load() {
      const { data, error } = await client
        .from('bookshelf_items')
        .select(`id, item_type, decoration_kind, position_x, position_y, orientation, spine_color, spine_color_customized, book:books(${bookColumns})`)
        .order('position_y', { ascending: true })
        .order('position_x', { ascending: true });
      if (error) throw error;

      const books: BookshelfBook[] = [];
      const decorations: BookshelfDecoration[] = [];
      for (const value of Array.isArray(data) ? data : []) {
        const row = asRecord(value);
        const x = numberValue(row.position_x);
        const y = numberValue(row.position_y);
        if (row.item_type === 'book' && row.book) {
          books.push({
            book: mapBookRecord(row.book),
            x,
            y,
            orientation: parseOrientation(row.orientation),
            spineColor: stringValue(row.spine_color),
            isColorCustomized: row.spine_color_customized === true,
          });
        } else if (row.item_type === 'decoration') {
          decorations.push({
            id: stringValue(row.id),
            kind: parseDecoration(row.decoration_kind),
            x,
            y,
          });
        }
      }
      return { books, decorations };
    },
    async moveBook(bookId, x, y) {
      const { error } = await client.from('bookshelf_items').update({ position_x: clamp(x, 0, 0.95), position_y: Math.max(0, y) }).eq('book_id', bookId);
      if (error) throw error;
    },
    async setOrientation(bookId, orientation) {
      const { error } = await client.from('bookshelf_items').update({ orientation }).eq('book_id', bookId);
      if (error) throw error;
    },
    async setSpineColor(bookId, color) {
      const { error } = await client.from('bookshelf_items').update({ spine_color: color, spine_color_customized: true }).eq('book_id', bookId);
      if (error) throw error;
    },
    async addDecoration(kind) {
      const { data, error: listError } = await client.from('bookshelf_items').select('position_y').order('position_y', { ascending: false }).limit(1);
      if (listError) throw listError;
      const lastY = Array.isArray(data) && data.length > 0 ? numberValue(asRecord(data[0]).position_y) : null;
      const { error } = await client.from('bookshelf_items').insert({
        item_type: 'decoration',
        decoration_kind: kind,
        position_x: 0.04,
        position_y: lastY === null ? 32 : lastY + 270,
      });
      if (error) throw error;
    },
    async moveDecoration(id, x, y) {
      const { error } = await client.from('bookshelf_items').update({ position_x: clamp(x, 0, 0.95), position_y: Math.max(0, y) }).eq('id', id);
      if (error) throw error;
    },
    async removeDecoration(id) {
      const { error } = await client.from('bookshelf_items').delete().eq('id', id).eq('item_type', 'decoration');
      if (error) throw error;
    },
  };
}

function parseOrientation(value: unknown): ShelfOrientation {
  return value === 'tilted' || value === 'horizontal' ? value : 'upright';
}

function parseDecoration(value: unknown): ShelfDecorationKind {
  return value === 'frame' ? value : 'plant';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
