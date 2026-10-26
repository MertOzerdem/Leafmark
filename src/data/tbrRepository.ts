import type { SupabaseClient } from '@supabase/supabase-js';

import type { BookDraft, TbrBook, TbrRepository } from '../books/bookTypes';
import { asRecord, bookColumns, mapBookRecord, numberValue } from './bookMapper';

export function createTbrRepository(client: SupabaseClient): TbrRepository {
  return {
    async list() {
      const { data, error } = await client
        .from('tbr_entries')
        .select(`position, added_at, book:books!inner(${bookColumns})`)
        .order('position', { ascending: true })
        .order('added_at', { ascending: true })
        .order('book_id', { ascending: true });

      if (error) throw error;
      if (!Array.isArray(data)) return [];

      return data.map((row) => {
        const entry = asRecord(row);
        return { ...mapBookRecord(entry.book), position: numberValue(entry.position) };
      });
    },
    async add(book) {
      const { data, error } = await client
        .rpc('add_book_to_tbr', {
          p_google_volume_id: book.googleVolumeId,
          p_title: book.title,
          p_authors: book.authors,
          p_cover_url: book.coverUrl,
          p_categories: book.categories,
          p_page_count: book.pageCount,
          p_description: book.description,
        })
        .single();

      if (error) throw error;
      return mapBookRecord(data);
    },
    async update(bookId, book) {
      const { data, error } = await client
        .from('books')
        .update(toDatabaseBook(book))
        .eq('id', bookId)
        .select(bookColumns)
        .single();

      if (error) throw error;
      return mapBookRecord(data);
    },
    async remove(bookId) {
      const { error } = await client.from('tbr_entries').delete().eq('book_id', bookId);
      if (error) throw error;
    },
    async reorder(bookIds) {
      const { error } = await client.rpc('reorder_tbr', { p_book_ids: bookIds });
      if (error) throw error;
    },
  };
}
function toDatabaseBook(book: BookDraft) {
  return {
    google_volume_id: book.googleVolumeId,
    title: book.title,
    authors: book.authors,
    cover_url: book.coverUrl,
    categories: book.categories,
    page_count: book.pageCount,
    description: book.description,
  };
}
