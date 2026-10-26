import type { SupabaseClient } from '@supabase/supabase-js';

import { createReaderProfileRepository } from './readerProfileRepository';

describe('Supabase reader profile adapter', () => {
  it('lets the database assign the owner and returns only the active reader profile', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { user_id: 'clerk_reader_ivy', username: 'reader-ivy' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const upsert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ upsert });
    const client = { from } as unknown as SupabaseClient;
    const profiles = createReaderProfileRepository(client);

    await expect(
      profiles.loadOrCreate({ subject: 'clerk_reader_ivy', username: 'reader-ivy' }),
    ).resolves.toEqual({
      subject: 'clerk_reader_ivy',
      username: 'reader-ivy',
      privateLabel: 'Private shelf for reader-ivy',
    });

    expect(from).toHaveBeenCalledWith('reader_profiles');
    expect(upsert).toHaveBeenCalledWith({ username: 'reader-ivy' }, { onConflict: 'user_id' });
  });

  it('rejects a profile response that does not belong to the active Clerk subject', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { user_id: 'clerk_someone_else', username: 'other-reader' },
      error: null,
    });
    const client = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single }) }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      createReaderProfileRepository(client).loadOrCreate({
        subject: 'clerk_reader_ivy',
        username: 'reader-ivy',
      }),
    ).rejects.toThrow('did not match the active account');
  });
});
