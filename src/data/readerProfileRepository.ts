import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthIdentity, ReaderProfileRepository } from '../auth/contracts';

export function createReaderProfileRepository(client: SupabaseClient): ReaderProfileRepository {
  return {
    async loadOrCreate(identity: AuthIdentity) {
      const { data, error } = await client
        .from('reader_profiles')
        .upsert({ username: identity.username }, { onConflict: 'user_id' })
        .select('user_id, username')
        .single();

      if (error) throw error;
      if (data.user_id !== identity.subject) {
        throw new Error('The profile returned by the data service did not match the active account.');
      }

      return {
        subject: data.user_id,
        username: data.username,
        privateLabel: `Private shelf for ${data.username}`,
      };
    },
  };
}
