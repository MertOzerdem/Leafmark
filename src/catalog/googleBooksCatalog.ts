import type { BookCatalog, BookDraft } from '../books/bookTypes';

interface CatalogFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type CatalogFetcher = (url: string) => Promise<CatalogFetchResponse>;

interface GoogleVolume {
  id?: unknown;
  volumeInfo?: {
    title?: unknown;
    authors?: unknown;
    imageLinks?: {
      extraLarge?: unknown;
      large?: unknown;
      medium?: unknown;
      small?: unknown;
      thumbnail?: unknown;
      smallThumbnail?: unknown;
    };
    categories?: unknown;
    pageCount?: unknown;
    description?: unknown;
  };
}

export function createGoogleBooksCatalog(fetcher: CatalogFetcher = fetch): BookCatalog {
  return {
    async search(query) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) return [];

      const searchUrl = new URL('https://www.googleapis.com/books/v1/volumes');
      searchUrl.searchParams.set('q', normalizedQuery);
      searchUrl.searchParams.set('printType', 'books');
      searchUrl.searchParams.set('maxResults', '20');

      const response = await fetcher(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`Google Books search failed (${response.status}).`);
      }

      const payload = asRecord(await response.json());
      const items = Array.isArray(payload.items) ? (payload.items as GoogleVolume[]) : [];
      return items.flatMap(mapVolume);
    },
  };
}

function mapVolume(value: unknown): BookDraft[] {
  const volume = asRecord(value) as GoogleVolume;
  const info = asRecord(volume.volumeInfo);
  const title = asNonEmptyString(info.title);
  const googleVolumeId = asNonEmptyString(volume.id);

  if (!title || !googleVolumeId) return [];

  const imageLinks = asRecord(info.imageLinks);
  const cover = [
    imageLinks.extraLarge,
    imageLinks.large,
    imageLinks.medium,
    imageLinks.small,
    imageLinks.thumbnail,
    imageLinks.smallThumbnail,
  ]
    .map(asNonEmptyString)
    .find((url): url is string => Boolean(url));

  return [
    {
      googleVolumeId,
      title,
      authors: stringArray(info.authors),
      coverUrl: cover?.replace(/^http:/i, 'https:') ?? null,
      categories: stringArray(info.categories),
      pageCount: positiveInteger(info.pageCount),
      description: asNonEmptyString(info.description),
    },
  ];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asNonEmptyString).filter((item): item is string => Boolean(item));
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
