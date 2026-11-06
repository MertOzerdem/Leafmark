import type { BookCatalog, BookDraft } from '../books/bookTypes';

interface CatalogFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type CatalogFetcher = (url: string) => Promise<CatalogFetchResponse>;

interface OpenLibraryDocument {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  cover_i?: unknown;
  subject?: unknown;
  number_of_pages_median?: unknown;
  first_sentence?: unknown;
}

export function createOpenLibraryCatalog(fetcher: CatalogFetcher = fetch): BookCatalog {
  return {
    async search(query) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) return [];

      const searchUrl = new URL('https://openlibrary.org/search.json');
      searchUrl.searchParams.set('q', normalizedQuery);
      searchUrl.searchParams.set('fields', 'key,title,author_name,cover_i,subject,number_of_pages_median,first_sentence');
      searchUrl.searchParams.set('limit', '20');
      const response = await fetcher(searchUrl.toString());
      if (!response.ok) throw new Error(`Open Library search failed (${response.status}).`);

      const payload = asRecord(await response.json());
      const docs = Array.isArray(payload.docs) ? payload.docs as OpenLibraryDocument[] : [];
      return docs.flatMap(mapDocument);
    },
  };
}

function mapDocument(value: unknown): BookDraft[] {
  const document = asRecord(value) as OpenLibraryDocument;
  const key = asString(document.key);
  const title = asString(document.title);
  if (!key || !title) return [];

  const coverId = positiveInteger(document.cover_i);
  const firstSentence = Array.isArray(document.first_sentence)
    ? document.first_sentence.map(asString).find(Boolean) ?? null
    : asString(document.first_sentence);

  return [{
    googleVolumeId: `openlibrary:${key}`,
    title,
    authors: stringArray(document.author_name),
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    categories: stringArray(document.subject).slice(0, 8),
    pageCount: positiveInteger(document.number_of_pages_median),
    description: firstSentence,
  }];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item): item is string => Boolean(item));
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
