import type { SupabaseClient } from '@supabase/supabase-js';

import type { BookDraft } from '../books/bookTypes';
import { createTbrRepository } from './tbrRepository';

describe('Supabase TBR repository', () => {
  it('adds a catalog book with owner and TBR position assigned by the database', async () => {
    const draft: BookDraft = {
      googleVolumeId: 'google-volume-7',
      title: 'A Garden of Stories',
      authors: ['A. Reader'],
      coverUrl: 'https://books.example/cover.jpg',
      categories: ['Fiction'],
      pageCount: 384,
      description: null,
    };
    const single = jest.fn().mockResolvedValue({
      data: {
        id: 'book-uuid',
        google_volume_id: draft.googleVolumeId,
        title: draft.title,
        authors: draft.authors,
        cover_url: draft.coverUrl,
        categories: draft.categories,
        page_count: draft.pageCount,
        description: draft.description,
      },
      error: null,
    });
    const rpc = jest.fn().mockReturnValue({ single });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(createTbrRepository(client).add(draft)).resolves.toEqual({ id: 'book-uuid', ...draft });

    expect(rpc).toHaveBeenCalledWith('add_book_to_tbr', {
      p_google_volume_id: 'google-volume-7',
      p_title: 'A Garden of Stories',
      p_authors: ['A. Reader'],
      p_cover_url: 'https://books.example/cover.jpg',
      p_categories: ['Fiction'],
      p_page_count: 384,
      p_description: null,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('user_id');
  });

  it('loads saved Book details in their persisted TBR order', async () => {
    const query = createQuery({
      data: [
        {
          position: 0,
          added_at: '2026-10-26T00:00:00Z',
          book: {
            id: 'book-uuid',
            google_volume_id: 'google-volume-7',
            title: 'Corrected title',
            authors: ['A. Reader'],
            cover_url: 'https://books.example/cover.jpg',
            categories: ['Fiction'],
            page_count: 384,
            description: 'Personal saved description',
          },
        },
      ],
      error: null,
    });
    const from = jest.fn().mockReturnValue(query);
    const repository = createTbrRepository({ from } as unknown as SupabaseClient);

    await expect(repository.list()).resolves.toEqual([
      {
        id: 'book-uuid',
        googleVolumeId: 'google-volume-7',
        title: 'Corrected title',
        authors: ['A. Reader'],
        coverUrl: 'https://books.example/cover.jpg',
        categories: ['Fiction'],
        pageCount: 384,
        description: 'Personal saved description',
        position: 0,
      },
    ]);

    expect(from).toHaveBeenCalledWith('tbr_entries');
    expect(query.order).toHaveBeenNthCalledWith(1, 'position', { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(3, 'book_id', { ascending: true });
  });

  it('loads and saves reader-owned TBR category colors', async () => {
    const query = createQuery({ data: [{ category_name: 'romance', color: '#D59AAA' }], error: null });
    const from = jest.fn().mockReturnValue(query);
    const repository = createTbrRepository({ from } as unknown as SupabaseClient);

    await expect(repository.listCategoryColors()).resolves.toEqual({ romance: '#D59AAA' });
    await repository.setCategoryColor(' Romance ', '#d59aaa');

    expect(from).toHaveBeenCalledWith('tbr_category_colors');
    expect(query.select).toHaveBeenCalledWith('category_name, color');
    expect(query.upsert).toHaveBeenCalledWith(
      { category_name: 'romance', color: '#D59AAA' },
      { onConflict: 'user_id,category_name' },
    );
    expect(query.upsert.mock.calls[0][0]).not.toHaveProperty('user_id');
  });

  it('updates a personal Book record without sending an owner id', async () => {
    const updatedDraft: BookDraft = {
      googleVolumeId: 'google-volume-7',
      title: 'My corrected title',
      authors: ['A. Reader'],
      coverUrl: null,
      categories: ['Romance'],
      pageCount: 400,
      description: null,
    };
    const query = createQuery({
      data: {
        id: 'book-uuid',
        google_volume_id: updatedDraft.googleVolumeId,
        title: updatedDraft.title,
        authors: updatedDraft.authors,
        cover_url: updatedDraft.coverUrl,
        categories: updatedDraft.categories,
        page_count: updatedDraft.pageCount,
        description: updatedDraft.description,
      },
      error: null,
    });
    const from = jest.fn().mockReturnValue(query);
    const repository = createTbrRepository({ from } as unknown as SupabaseClient);

    await expect(repository.update('book-uuid', updatedDraft)).resolves.toEqual({ id: 'book-uuid', ...updatedDraft });

    expect(query.update).toHaveBeenCalledWith({
      google_volume_id: 'google-volume-7',
      title: 'My corrected title',
      authors: ['A. Reader'],
      cover_url: null,
      categories: ['Romance'],
      page_count: 400,
      description: null,
    });
    expect(JSON.stringify(query.update.mock.calls)).not.toContain('user_id');
  });

  it('removes only a TBR membership and saves the requested book order', async () => {
    const query = createQuery({ data: null, error: null });
    const rpc = jest.fn().mockResolvedValue({ error: null });
    const client = {
      from: jest.fn().mockReturnValue(query),
      rpc,
    } as unknown as SupabaseClient;
    const repository = createTbrRepository(client);

    await repository.remove('book-uuid');
    await repository.reorder(['book-second', 'book-first']);

    expect(query.delete).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith('book_id', 'book-uuid');
    expect(rpc).toHaveBeenCalledWith('reorder_tbr', {
      p_book_ids: ['book-second', 'book-first'],
    });
  });
});

function createQuery(result: unknown) {
  const query = {} as {
    select: jest.Mock;
    order: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
    eq: jest.Mock;
    delete: jest.Mock;
    single: jest.Mock;
    then: jest.Mock;
  };
  query.select = jest.fn(() => query);
  query.order = jest.fn(() => query);
  query.update = jest.fn(() => query);
  query.upsert = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.delete = jest.fn(() => query);
  query.single = jest.fn().mockResolvedValue(result);
  query.then = jest.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject));
  return query;
}
