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
const readingMigration = await readFile(
  new URL('../../supabase/migrations/20261026000300_reading_activity.sql', import.meta.url),
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
  await database.exec(readingMigration);
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

const categories = [
  { position: 0, minimum: 1, maximum: 10, color: '#EFE4E7' },
  { position: 1, minimum: 11, maximum: 30, color: '#D7B5C0' },
  { position: 2, minimum: 31, maximum: 60, color: '#B98598' },
  { position: 3, minimum: 61, maximum: 120, color: '#896878' },
  { position: 4, minimum: 121, maximum: null, color: '#5A4351' },
];

test('reader-owned activity keeps daily totals tied to a category configuration and Reading attempt', async (t) => {
  const database = await createDatabase();

  try {
    const garden = await database.query(
      "insert into public.books (user_id, title, authors) values ('reader_a', 'A Garden of Stories', array['A. Reader']) returning id",
    );
    const map = await database.query(
      "insert into public.books (user_id, title, authors) values ('reader_a', 'Map of Quiet Stars', array['M. Writer']) returning id",
    );
    const fresh = await database.query(
      "insert into public.books (user_id, title, authors) values ('reader_a', 'A Fresh Start', array['N. Reader']) returning id",
    );

    await t.test('records a start, maps exact totals to ranges, and upserts one daily amount per attempt', async () => {
      const result = await asReader(database, 'reader_a', async () => {
        const configuration = await database.query(
          'select * from public.save_reading_configuration(null, $1, $2, $3::jsonb)',
          ['pages', '2027-01-01', JSON.stringify(categories)],
        );
        const attempt = await database.query(
          'select * from public.start_reading_attempt($1, $2)',
          [garden.rows[0].id, '2027-01-02'],
        );
        const initialLog = await database.query(
          'select * from public.save_daily_reading_total(null, $1, $2, $3, $4)',
          [garden.rows[0].id, configuration.rows[0].id, '2027-01-03', 25],
        );
        const replacedLog = await database.query(
          'select * from public.save_daily_reading_total(null, $1, $2, $3, $4)',
          [garden.rows[0].id, configuration.rows[0].id, '2027-01-03', 28],
        );
        const current = await database.query(
          'select book_id, started_on from public.reading_attempts where is_current',
        );
        const totalLogs = await database.query('select count(*)::integer as count from public.reading_logs');
        return { configuration: configuration.rows[0], attempt: attempt.rows[0], initialLog: initialLog.rows[0], replacedLog: replacedLog.rows[0], current, totalLogs };
      });

      assert.equal(result.configuration.measure, 'pages');
      assert.deepEqual(result.attempt.book_id, garden.rows[0].id);
      assert.equal(dateString(result.attempt.started_on), '2027-01-02');
      assert.equal(result.initialLog.id, result.replacedLog.id);
      assert.equal(result.replacedLog.amount, 28);
      assert.equal(result.replacedLog.category_position, 1);
      assert.deepEqual(result.current.rows.map((row) => ({ ...row, started_on: dateString(row.started_on) })), [
        { book_id: garden.rows[0].id, started_on: '2027-01-02' },
      ]);
      assert.equal(result.totalLogs.rows[0].count, 1);
    });

    await t.test('a log reassignment preserves Current book, while a first log can start its own book', async () => {
      const result = await asReader(database, 'reader_a', async () => {
        const configuration = await database.query(
          'select * from public.save_reading_configuration(null, $1, $2, $3::jsonb)',
          ['pages', '2027-01-01', JSON.stringify(categories)],
        );
        const attempt = await database.query(
          'select * from public.start_reading_attempt($1, $2)',
          [garden.rows[0].id, '2027-01-02'],
        );
        const log = await database.query(
          'select * from public.save_daily_reading_total(null, $1, $2, $3, $4)',
          [garden.rows[0].id, configuration.rows[0].id, '2027-01-03', 25],
        );
        const reassigned = await database.query(
          'select * from public.save_daily_reading_total($1, $2, $3, $4, $5)',
          [log.rows[0].id, map.rows[0].id, configuration.rows[0].id, '2027-01-04', 25],
        );
        const currentAfterCorrection = await database.query(
          'select book_id from public.reading_attempts where is_current',
        );
        const firstMapLog = await database.query(
          'select * from public.save_daily_reading_total(null, $1, $2, $3, $4)',
          [fresh.rows[0].id, configuration.rows[0].id, '2027-01-05', 35],
        );
        const mapAttempt = await database.query(
          'select book_id, started_on, is_current from public.reading_attempts where id = $1',
          [firstMapLog.rows[0].attempt_id],
        );
        return { attempt: attempt.rows[0], reassigned: reassigned.rows[0], currentAfterCorrection, mapAttempt };
      });

      assert.equal(result.reassigned.id !== null, true);
      assert.equal(dateString(result.reassigned.logged_on), '2027-01-04');
      assert.equal(result.currentAfterCorrection.rows[0].book_id, garden.rows[0].id);
      assert.equal(result.mapAttempt.rows[0].book_id, fresh.rows[0].id);
      assert.equal(dateString(result.mapAttempt.rows[0].started_on), '2027-01-05');
      assert.equal(result.mapAttempt.rows[0].is_current, true);
    });

    await t.test('used category ranges are immutable while shared colors can be changed', async () => {
      const immutableError = await asReader(database, 'reader_a', async () => {
        const configuration = await database.query(
          'select * from public.save_reading_configuration(null, $1, $2, $3::jsonb)',
          ['pages', '2027-01-01', JSON.stringify(categories)],
        );
        await database.query('select * from public.start_reading_attempt($1, $2)', [garden.rows[0].id, '2027-01-02']);
        await database.query(
          'select * from public.save_daily_reading_total(null, $1, $2, $3, $4)',
          [garden.rows[0].id, configuration.rows[0].id, '2027-01-03', 25],
        );
        let nextMinimum = 1;
        const changedRanges = categories.map((category, index) => {
          const maximum = index === 0 ? 9 : category.maximum;
          const changedCategory = { ...category, minimum: nextMinimum, maximum };
          if (maximum !== null) nextMinimum = maximum + 1;
          return changedCategory;
        });
        try {
          await database.query(
            'update public.reading_configurations set categories = $1::jsonb where id = $2',
            [JSON.stringify(changedRanges), configuration.rows[0].id],
          );
          return null;
        } catch (error) {
          return error;
        }
      });

      assert.equal(immutableError?.code, '22023');
      const result = await asReader(database, 'reader_a', async () => {
        const color = await database.query(
          "insert into public.reading_category_colors (position, color) values (1, '#123456') on conflict (user_id, position) do update set color = excluded.color returning color",
        );
        return color;
      });

      assert.deepEqual(result.rows, [{ color: '#123456' }]);
    });

    await t.test('another reader and anonymous clients cannot access or forge activity', async () => {
      const readerBBook = await database.query(
        "insert into public.books (user_id, title) values ('reader_b', 'Reader B Book') returning id",
      );
      const config = await database.query(
        "insert into public.reading_configurations (user_id, measure, starts_on, categories) values ('reader_b', 'pages', '2027-01-01', $1::jsonb) returning id",
        [JSON.stringify(categories)],
      );
      const attempt = await database.query(
        'insert into public.reading_attempts (user_id, book_id, started_on, is_current) values ($1, $2, $3, true) returning id',
        ['reader_b', readerBBook.rows[0].id, '2027-01-02'],
      );
      await database.query(
        'insert into public.reading_logs (user_id, attempt_id, configuration_id, logged_on, amount, category_position) values ($1, $2, $3, $4, $5, $6)',
        ['reader_b', attempt.rows[0].id, config.rows[0].id, '2027-01-03', 25, 1],
      );

      const hidden = await asReader(database, 'reader_a', async () => ({
        configs: await database.query('select id from public.reading_configurations'),
        attempts: await database.query('select id from public.reading_attempts'),
        logs: await database.query('select id from public.reading_logs'),
      }));
      assert.deepEqual(hidden.configs.rows, []);
      assert.deepEqual(hidden.attempts.rows, []);
      assert.deepEqual(hidden.logs.rows, []);

      await assert.rejects(
        asReader(database, 'reader_a', () => database.query(
          'select * from public.save_daily_reading_total(null, $1, $2, $3, $4)',
          [map.rows[0].id, config.rows[0].id, '2027-01-03', 25],
        )),
        (error) => error.code === '42501',
      );

      await assert.rejects(
        asReader(database, 'anonymous', () => database.query('select * from public.reading_logs'), 'anon'),
        (error) => error.code === '42501',
      );
      await assert.rejects(
        asReader(database, 'anonymous', () => database.query(
          'select * from public.start_reading_attempt($1, $2)',
          [map.rows[0].id, '2027-01-02'],
        ), 'anon'),
        (error) => error.code === '42501',
      );
    });
  } finally {
    await database.close();
  }
});

function dateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
