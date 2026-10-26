export interface BookDraft {
  googleVolumeId: string | null;
  title: string;
  authors: string[];
  coverUrl: string | null;
  categories: string[];
  pageCount: number | null;
  description: string | null;
}

export interface Book extends BookDraft {
  id: string;
}

export interface TbrBook extends Book {
  position: number;
}

export interface BookCatalog {
  search(query: string): Promise<BookDraft[]>;
}

export interface TbrRepository {
  list(): Promise<TbrBook[]>;
  add(book: BookDraft): Promise<Book>;
  update(bookId: string, book: BookDraft): Promise<Book>;
  remove(bookId: string): Promise<void>;
  reorder(bookIds: string[]): Promise<void>;
}
