import { createGoogleBooksCatalog } from './googleBooksCatalog';

describe('Google Books catalog adapter', () => {
  it('maps search results into editable book details', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'volume-42',
            volumeInfo: {
              title: 'A Garden of Stories',
              authors: ['A. Reader', 'B. Writer'],
              imageLinks: { thumbnail: 'http://books.example/cover.jpg' },
              categories: ['Fiction', 'Romance'],
              pageCount: 384,
              description: 'A story among the flowers.',
            },
          },
          { id: 'missing-title', volumeInfo: { authors: ['Unknown'] } },
        ],
      }),
    });
    const catalog = createGoogleBooksCatalog(fetcher);

    await expect(catalog.search('garden stories')).resolves.toEqual([
      {
        googleVolumeId: 'volume-42',
        title: 'A Garden of Stories',
        authors: ['A. Reader', 'B. Writer'],
        coverUrl: 'https://books.example/cover.jpg',
        categories: ['Fiction', 'Romance'],
        pageCount: 384,
        description: 'A story among the flowers.',
      },
    ]);

    const requestUrl = fetcher.mock.calls[0][0] as string;
    expect(requestUrl).toContain('https://www.googleapis.com/books/v1/volumes?');
    expect(new URL(requestUrl).searchParams.get('q')).toBe('garden stories');
    expect(new URL(requestUrl).searchParams.get('printType')).toBe('books');
  });

  it('returns an empty result for blank queries without making a request', async () => {
    const fetcher = jest.fn();
    const catalog = createGoogleBooksCatalog(fetcher);

    await expect(catalog.search('  ')).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports catalog service failures', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const catalog = createGoogleBooksCatalog(fetcher);

    await expect(catalog.search('garden')).rejects.toThrow('Google Books search failed');
  });
});
