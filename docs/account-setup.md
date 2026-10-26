# Local account and data setup

Leafmark creates username-and-password accounts directly on the iPad. Account credentials and reading data stay in Leafmark's local SQLite database; the active account ID is kept in iOS SecureStore. Each account has a separate local journal. Signing out and signing into another account on the same iPad switches workspaces.

These accounts are local profiles, not online identities. Leafmark has no application server, Clerk, Supabase, cloud backup, password recovery, or cross-device synchronization. A local account cannot be moved to another device in this release. Do not present a local account as a cloud security boundary; it partitions the app's data for readers who share one iPad.

## Run on iPad

Install dependencies and start the iOS build:

```sh
npm install
npm run ios
```

The first launch creates `leafmark.db` and its local account/workspace tables automatically. Create a local username and password on the iPad. The password verifier is salted and derived with PBKDF2; the password itself is not written to SQLite. Leafmark keeps the local session until the reader signs out.

There is no password recovery. Removing the app or losing the iPad may remove the local journal. Account export and device transfer are future decisions.

## Book search

Catalog search uses the [public Google Books volumes list endpoint](https://developers.google.com/books/docs/v1/reference/volumes/list). Search requires an internet connection, but it does not create a Leafmark account or send reading-journal data. Selected book details are copied into the local account's editable Book record; manual entry remains available.

## Verify local behavior

`npm run typecheck` checks TypeScript and `npm test` runs app-flow and local-account tests. App-flow tests use deterministic auth, catalog, and data services at the UI-to-app-services boundary. On iPad, manually verify account creation, sign-out/sign-in, switching between two local accounts, and persistence after reopening the app.
