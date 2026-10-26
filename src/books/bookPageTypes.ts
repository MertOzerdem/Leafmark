import type { Book, BookDraft } from './bookTypes';

export type BookPageFieldType = 'text' | 'multiline' | 'list' | 'image';

export interface BookPageField {
  id: string;
  bookId: string | null;
  label: string;
  type: BookPageFieldType;
  position: number;
  isTemplate: boolean;
}

export interface BookPageFieldValue {
  fieldId: string;
  value: string;
  displayUrl?: string;
}

export interface BookPageRepository {
  listTemplateFields(): Promise<BookPageField[]>;
  listFields(bookId: string): Promise<BookPageField[]>;
  listValues(bookId: string): Promise<BookPageFieldValue[]>;
  addField(input: { bookId: string | null; label: string; type: BookPageFieldType; position: number }): Promise<BookPageField>;
  updateField(field: BookPageField): Promise<void>;
  reorderFields(bookId: string | null, fieldIds: string[]): Promise<void>;
  removeField(fieldId: string): Promise<void>;
  saveValue(bookId: string, fieldId: string, value: string | null): Promise<void>;
  uploadImage(ownerSubject: string, bookId: string, fieldId: string, uri: string): Promise<{ value: string; displayUrl: string }>;
  deleteBookPage(bookId: string): Promise<void>;
  updateBook(bookId: string, book: BookDraft): Promise<Book>;
}
