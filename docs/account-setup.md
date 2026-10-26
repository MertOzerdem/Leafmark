# Account and private data setup

Leafmark uses Clerk for username-and-password accounts and Supabase for synced reader-owned data. The app sends the signed-in Clerk session token to Supabase; PostgreSQL row-level security checks the Clerk `sub` claim on every profile, Book, or TBR read or write.

## Configure Clerk

1. Create a Clerk application and enable its Native API for native app authentication.
2. In **User & authentication**, enable username for sign-up and sign-in, and enable password sign-up and sign-in.
3. Do not require email or phone for this first release. Keep the instance's access mode open so a reader can create an account. Password recovery is intentionally outside this ticket because it needs a verified recovery channel.
4. In the Clerk Supabase integration, connect this Clerk instance to the Supabase project and copy its Clerk domain.

## Configure Supabase

1. In **Authentication → Sign In / Providers → Third-party Auth**, add Clerk with the domain from the Clerk integration setup.
2. Apply the migrations in `supabase/migrations/` to the project. This creates private reader profiles, Books, ordered TBR entries, and reader-owned Reading configurations, attempts, and daily logs. With the Supabase CLI installed and the project linked, run `supabase db push`.
3. Keep Row Level Security enabled for all future private reader tables. Their owner key should be derived from `auth.jwt()->>'sub'`, and every read/write policy must compare that key to the requesting subject.

For local Supabase development, `.env` also needs `CLERK_DOMAIN`; the checked-in `supabase/config.toml` uses it to enable Clerk as a local third-party provider.

## Run the app

Copy `.env.example` to `.env` and fill in the Clerk publishable key, Supabase project URL, and Supabase publishable key. These are client-side public settings; never place a Clerk secret key or Supabase service-role key in an `EXPO_PUBLIC_` variable or in the app.

Then run:

```sh
npm install
npm start
```

The first screen lists any missing settings when `.env` has not been configured. Once configured, account creation and sign-in open the same private shell, and signing out returns to the account screen.

## Book search

Catalog search uses the [public Google Books volumes list endpoint](https://developers.google.com/books/docs/v1/reference/volumes/list) and does not require a Google account. The app searches up to 20 book results and copies selected metadata into the reader's own Book record. If Google Books has no match or is unavailable, manual entry remains available.

## Verify ownership policies

`npm run test:rls` runs the production migrations in a local PostgreSQL-compatible engine and verifies that separate Clerk subjects cannot read, insert, update, or delete one another's profile or Book data, manipulate another reader's TBR entries, or access another reader's Reading activity. It also checks that daily totals map to the saved category ranges and that ranges cannot change after use. The app-flow tests use fake auth, catalog, and data services at the UI-to-service boundary; no test account or real user data is needed.
