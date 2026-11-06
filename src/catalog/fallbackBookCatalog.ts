import type { BookCatalog } from '../books/bookTypes';

export function createFallbackBookCatalog(primary: BookCatalog, fallback: BookCatalog): BookCatalog {
  return {
    async search(query) {
      try {
        const primaryResults = await primary.search(query);
        if (primaryResults.length > 0) return primaryResults;
      } catch {
        // Continue to the public fallback catalog when the primary provider is unavailable.
      }
      return fallback.search(query);
    },
  };
}
