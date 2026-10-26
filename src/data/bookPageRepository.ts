import type { SupabaseClient } from '@supabase/supabase-js';

import type { BookPageField, BookPageFieldType, BookPageRepository, BookPageFieldValue } from '../books/bookPageTypes';
import type { Book, BookDraft } from '../books/bookTypes';
import { asRecord, bookColumns, mapBookRecord, numberValue, stringValue } from './bookMapper';

export function createBookPageRepository(client: SupabaseClient): BookPageRepository {
  return {
    async listTemplateFields() {
      const { data, error } = await client.from('book_page_fields')
        .select('id, book_id, label, field_type, position, is_template')
        .eq('is_active', true)
        .eq('is_template', true)
        .order('position', { ascending: true });
      if (error) throw error;
      return Array.isArray(data) ? data.map(mapField) : [];
    },
    async listFields(bookId) {
      const { data, error } = await client
        .from('book_page_fields')
        .select('id, book_id, label, field_type, position, is_template')
        .eq('is_active', true)
        .or(`book_id.is.null,book_id.eq.${bookId}`)
        .order('position', { ascending: true });
      if (error) throw error;
      return Array.isArray(data) ? data.map(mapField) : [];
    },
    async listValues(bookId) {
      const { data, error } = await client
        .from('book_page_field_values')
        .select('field_id, value, field:book_page_fields!inner(field_type)')
        .eq('book_id', bookId);
      if (error) throw error;
      const values: BookPageFieldValue[] = [];
      for (const value of Array.isArray(data) ? data : []) {
        const row = asRecord(value);
        const savedValue = stringValue(row.value);
        const fieldId = stringValue(row.field_id);
        if (savedValue.startsWith('storage://')) {
          const path = savedValue.slice('storage://'.length);
          const { data: signed, error: signedError } = await client.storage.from('book-page-images').createSignedUrl(path, 3600);
          if (signedError) throw signedError;
          values.push({ fieldId, value: savedValue, displayUrl: signed.signedUrl });
        } else {
          values.push({ fieldId, value: savedValue, displayUrl: savedValue });
        }
      }
      return values;
    },
    async addField(input) {
      const { data, error } = await client.from('book_page_fields').insert({
        book_id: input.bookId,
        label: input.label.trim(),
        field_type: input.type,
        position: input.position,
        is_template: input.bookId === null,
      }).select('id, book_id, label, field_type, position, is_template').single();
      if (error) throw error;
      return mapField(data);
    },
    async updateField(field) {
      const { error } = await client.from('book_page_fields').update({
        label: field.label.trim(),
        field_type: field.type,
        position: field.position,
      }).eq('id', field.id);
      if (error) throw error;
    },
    async reorderFields(bookId, fieldIds) {
      const { error } = await client.rpc('reorder_book_page_fields', {
        p_book_id: bookId,
        p_field_ids: fieldIds,
      });
      if (error) throw error;
    },
    async removeField(fieldId) {
      const { error } = await client.from('book_page_fields').update({ is_active: false }).eq('id', fieldId);
      if (error) throw error;
    },
    async saveValue(bookId, fieldId, value) {
      if (value === null) {
        const { error } = await client.from('book_page_field_values').delete().eq('book_id', bookId).eq('field_id', fieldId);
        if (error) throw error;
        return;
      }
      const { error } = await client.from('book_page_field_values').upsert(
        { book_id: bookId, field_id: fieldId, value },
        { onConflict: 'book_id,field_id' },
      );
      if (error) throw error;
    },
    async uploadImage(ownerSubject, bookId, fieldId, uri) {
      const response = await fetch(uri);
      if (!response.ok) throw new Error('The selected image could not be read.');
      const image = await response.blob();
      if (!image.type.startsWith('image/')) throw new Error('Choose an image file.');
      if (image.size > 10 * 1024 * 1024) throw new Error('Images must be smaller than 10 MB.');
      const extension = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : image.type === 'image/heic' ? 'heic' : 'jpg';
      const path = `${ownerSubject}/${bookId}/${fieldId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const { error: uploadError } = await client.storage.from('book-page-images').upload(path, image, {
        contentType: image.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error: signedError } = await client.storage.from('book-page-images').createSignedUrl(path, 3600);
      if (signedError) throw signedError;
      return { value: `storage://${path}`, displayUrl: data.signedUrl };
    },
    async deleteBookPage(bookId) {
      const { error } = await client.rpc('delete_book_page', { p_book_id: bookId });
      if (error) throw error;
    },
    async updateBook(bookId, book): Promise<Book> {
      const { data, error } = await client.from('books').update(toDatabaseBook(book)).eq('id', bookId).select(bookColumns).single();
      if (error) throw error;
      return mapBookRecord(data);
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

function mapField(value: unknown): BookPageField {
  const row = asRecord(value);
  const id = stringValue(row.id);
  const type = row.field_type;
  if (!id || (type !== 'text' && type !== 'multiline' && type !== 'list' && type !== 'image')) {
    throw new Error('The data service returned an incomplete Book page field.');
  }
  return {
    id,
    bookId: typeof row.book_id === 'string' ? row.book_id : null,
    label: stringValue(row.label),
    type: type as BookPageFieldType,
    position: numberValue(row.position),
    isTemplate: row.is_template === true,
  };
}
