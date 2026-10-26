import type { SupabaseClient } from '@supabase/supabase-js';

import type { Book, BookDraft, TbrBook, TbrRepository } from '../books/bookTypes';

const bookColumns = 'id, google_volume_id, title, authors, cover_url, categories, page_count, description';

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
        return { ...mapBook(entry.book), position: numberValue(entry.position) };
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
      return mapBook(data);
    },
    async update(bookId, book) {
      const { data, error } = await client
        .from('books')
        .update(toDatabaseBook(book))
        .eq('id', bookId)
        .select(bookColumns)
        .single();

      if (error) throw error;
      return mapBook(data);
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

function mapBook(value: unknown): Book {
  const row = asRecord(value);
  const id = stringValue(row.id);
  const title = stringValue(row.title);
  if (!id || !title) throw new Error('The data service returned an incomplete Book record.');

  return {
    id,
    googleVolumeId: nullableString(row.google_volume_id),
    title,
    authors: stringArray(row.authors),
    coverUrl: nullableString(row.cover_url),
    categories: stringArray(row.categories),
    pageCount: nullableNumber(row.page_count),
    description: nullableString(row.description),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
