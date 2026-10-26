import type { Book } from './bookTypes';

export type ShelfOrientation = 'upright' | 'tilted' | 'horizontal';
export type ShelfDecorationKind = 'plant' | 'frame';

export interface BookshelfBook {
  book: Book;
  x: number;
  y: number;
  orientation: ShelfOrientation;
  spineColor: string;
  isColorCustomized: boolean;
}

export interface BookshelfDecoration {
  id: string;
  kind: ShelfDecorationKind;
  x: number;
  y: number;
}

export interface BookshelfRepository {
  load(): Promise<{ books: BookshelfBook[]; decorations: BookshelfDecoration[] }>;
  moveBook(bookId: string, x: number, y: number): Promise<void>;
  setOrientation(bookId: string, orientation: ShelfOrientation): Promise<void>;
  setSpineColor(bookId: string, color: string): Promise<void>;
  addDecoration(kind: ShelfDecorationKind): Promise<void>;
  moveDecoration(id: string, x: number, y: number): Promise<void>;
  removeDecoration(id: string): Promise<void>;
}
