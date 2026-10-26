import type { Book } from '../books/bookTypes';

export const bookColumns = 'id, google_volume_id, title, authors, cover_url, categories, page_count, description';

export function mapBookRecord(value: unknown): Book {
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

export function asRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
