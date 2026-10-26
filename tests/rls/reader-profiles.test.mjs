import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../../supabase/migrations/20261026000100_create_reader_profiles.sql', import.meta.url),
  'utf8',
);

test('reader profile row-level policies isolate accounts in PostgreSQL', async (t) => {
  const database = new PGlite();

  try {
    await database.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create function auth.jwt() returns jsonb
        language sql stable
        as $$
          select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
        $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.jwt() to authenticated;
    `);
    await database.exec(migration);
    await database.exec(`
      insert into public.reader_profiles (user_id, username)
      values ('clerk_reader_b', 'reader-b');
    `);

    async function asReader(subject, operation) {
      await database.exec('begin; set local role authenticated;');
      await database.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: subject, role: 'authenticated' }),
      ]);
      try {
        const result = await operation();
        await database.exec('rollback;');
        return result;
      } catch (error) {
        await database.exec('rollback;');
        throw error;
      }
    }

    await t.test('a reader can only select their own profile', async () => {
      const readerA = await asReader('clerk_reader_a', () =>
        database.query('select user_id, username from public.reader_profiles'),
      );
      const readerB = await asReader('clerk_reader_b', () =>
        database.query('select user_id, username from public.reader_profiles'),
      );

      assert.deepEqual(readerA.rows, []);
      assert.deepEqual(readerB.rows, [{ user_id: 'clerk_reader_b', username: 'reader-b' }]);
    });

    await t.test('a new profile is assigned to the active Clerk subject', async () => {
      const inserted = await asReader('clerk_reader_a', () =>
        database.query(
          'insert into public.reader_profiles (username) values ($1) returning user_id, username',
          ['reader-a'],
        ),
      );

      assert.deepEqual(inserted.rows, [{ user_id: 'clerk_reader_a', username: 'reader-a' }]);
    });

    await t.test('a reader cannot forge, update, or delete another account profile', async () => {
      await assert.rejects(
        asReader('clerk_reader_a', () =>
          database.query(
            'insert into public.reader_profiles (user_id, username) values ($1, $2)',
            ['clerk_reader_c', 'forged'],
          ),
        ),
        (error) => error.code === '42501',
      );

      const update = await asReader('clerk_reader_a', () =>
        database.query(
          "update public.reader_profiles set username = 'stolen' where user_id = 'clerk_reader_b' returning user_id",
        ),
      );
      const deletion = await asReader('clerk_reader_a', () =>
        database.query("delete from public.reader_profiles where user_id = 'clerk_reader_b' returning user_id"),
      );
      const originalRow = await database.query(
        "select user_id, username from public.reader_profiles where user_id = 'clerk_reader_b'",
      );

      assert.deepEqual(update.rows, []);
      assert.deepEqual(deletion.rows, []);
      assert.deepEqual(originalRow.rows, [{ user_id: 'clerk_reader_b', username: 'reader-b' }]);
    });

    await t.test('anonymous clients have no profile table privileges', async () => {
      await database.exec('begin; set local role anon;');
      try {
        await assert.rejects(
          database.query('select * from public.reader_profiles'),
          (error) => error.code === '42501',
        );
      } finally {
        await database.exec('rollback;');
      }
    });
  } finally {
    await database.close();
  }
});
