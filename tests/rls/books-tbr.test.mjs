import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const profileMigration = await readFile(
  new URL('../../supabase/migrations/20261026000100_create_reader_profiles.sql', import.meta.url),
  'utf8',
);
const booksMigration = await readFile(
  new URL('../../supabase/migrations/20261026000200_create_books_and_tbr.sql', import.meta.url),
  'utf8',
);

async function createDatabase() {
  const database = new PGlite();
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
  await database.exec(profileMigration);
  await database.exec(booksMigration);
  return database;
}

async function asReader(database, subject, operation, role = 'authenticated') {
  await database.exec('begin; set local role ' + role + ';');
  await database.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: subject, role }),
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

test('reader-owned Books and ordered TBR entries stay private', async (t) => {
  const database = await createDatabase();

  try {
    await t.test('adds books to the end, preserves catalog corrections, and reorders the list', async () => {
      const result = await asReader(database, 'clerk_reader_a', async () => {
        const manual = await database.query(
          "select * from public.add_book_to_tbr(null, 'Manual title', array['Reader'], null, array['Fiction'], 180, null)",
        );
        const imported = await database.query(
          "select * from public.add_book_to_tbr('volume-1', 'Catalog title', array['Catalog author'], 'https://books.example/cover.jpg', array['Romance'], 320, 'Summary')",
        );
        await database.query("update public.books set title = 'My corrected title' where id = $1", [imported.rows[0].id]);
        const duplicate = await database.query(
          "select * from public.add_book_to_tbr('volume-1', 'Catalog title changed upstream', array['Other author'], null, array[]::text[], null, null)",
        );
        const initialOrder = await database.query(
          'select book_id, position from public.tbr_entries order by position, added_at, book_id',
        );
        await database.query('select public.reorder_tbr($1::uuid[])', [[manual.rows[0].id, imported.rows[0].id]]);
        const reordered = await database.query(
          'select book_id, position from public.tbr_entries order by position, added_at, book_id',
        );
        const removed = await database.query(
          'delete from public.tbr_entries where book_id = $1 returning book_id',
          [manual.rows[0].id],
        );
        const retainedBook = await database.query(
          'select id from public.books where id = $1',
          [manual.rows[0].id],
        );
        const totalBooks = await database.query('select count(*)::integer as count from public.books');

        return { manual: manual.rows[0], imported: imported.rows[0], duplicate: duplicate.rows[0], initialOrder, reordered, removed, retainedBook, totalBooks };
      });

      assert.equal(result.manual.user_id, 'clerk_reader_a');
      assert.equal(result.imported.user_id, 'clerk_reader_a');
      assert.equal(result.duplicate.id, result.imported.id);
      assert.equal(result.duplicate.title, 'My corrected title');
      assert.deepEqual(result.initialOrder.rows.map((row) => row.position), [0, 1]);
      assert.deepEqual(result.reordered.rows.map((row) => row.book_id), [result.manual.id, result.imported.id]);
      assert.deepEqual(result.reordered.rows.map((row) => row.position), [0, 1]);
      assert.deepEqual(result.removed.rows, [{ book_id: result.manual.id }]);
      assert.deepEqual(result.retainedBook.rows, [{ id: result.manual.id }]);
      assert.equal(result.totalBooks.rows[0].count, 2);
    });

    await t.test('another reader cannot read, forge, reorder, update, or delete a Book', async () => {
      const seededBook = await database.query(
        "insert into public.books (user_id, title, authors) values ('clerk_reader_b', 'Private title', array['Reader B']) returning id",
      );
      await database.query(
        'insert into public.tbr_entries (user_id, book_id, position) values ($1, $2, 0)',
        ['clerk_reader_b', seededBook.rows[0].id],
      );

      const readerAView = await asReader(database, 'clerk_reader_a', async () => {
        const books = await database.query('select id from public.books');
        const entries = await database.query('select book_id from public.tbr_entries');
        const update = await database.query(
          "update public.books set title = 'Stolen' where id = $1 returning id",
          [seededBook.rows[0].id],
        );
        const deletion = await database.query(
          'delete from public.tbr_entries where book_id = $1 returning id',
          [seededBook.rows[0].id],
        );

        return { books, entries, update, deletion };
      });

      assert.deepEqual(readerAView.books.rows, []);
      assert.deepEqual(readerAView.entries.rows, []);
      assert.deepEqual(readerAView.update.rows, []);
      assert.deepEqual(readerAView.deletion.rows, []);

      await assert.rejects(
        asReader(database, 'clerk_reader_a', () =>
          database.query(
            "insert into public.books (user_id, title) values ('clerk_reader_b', 'Forged')",
          ),
        ),
        (error) => error.code === '42501',
      );

      await assert.rejects(
        asReader(database, 'clerk_reader_a', () =>
          database.query('select public.reorder_tbr($1::uuid[])', [[seededBook.rows[0].id]]),
        ),
        (error) => error.code === '22023',
      );
    });

    await t.test('anonymous clients cannot access private Books or the TBR API', async () => {
      await assert.rejects(
        asReader(database, 'anonymous', () => database.query('select * from public.books'), 'anon'),
        (error) => error.code === '42501',
      );
      await assert.rejects(
        asReader(database, 'anonymous', () =>
          database.query("select * from public.add_book_to_tbr(null, 'No access', array[]::text[], null, array[]::text[], null, null)"),
        'anon'),
        (error) => error.code === '42501',
      );
    });
  } finally {
    await database.close();
  }
});
