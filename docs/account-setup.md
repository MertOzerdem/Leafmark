# Local account and data setup

The active Leafmark product is the iPad Safari PWA. It stores username-and-password profiles and each reader’s journal in IndexedDB for the current site origin on that device. No account, password, reading history, or Book page data is sent to a Leafmark backend; the public GitHub Pages site serves application files only.

Profiles are local workspace partitions for readers who share one iPad. They are not online identities or a security boundary. The active profile is restored when Leafmark reopens, and completed journal changes are saved to IndexedDB automatically. Passwords are stored as salted PBKDF2 verifiers rather than plaintext. There is no password recovery or device sync.

## Open Leafmark on iPad

Open the published Leafmark site in Safari. For the app-style window, tap **Share**, choose **Add to Home Screen**, and open the new Home Screen icon. The PWA requests persistent origin storage when it detects that standalone launch and shows whether Safari granted it. If the grant is unavailable, Safari may remove site data during storage cleanup; the backup workflow is tracked separately.

The first visit and application updates require internet. After the service worker caches the application shell, account and journal workflows use on-device data and can reopen offline.

## Local account behavior

Create a username and password on the device. Leafmark keeps the active local profile until sign-out. Signing into another existing profile switches to that profile’s separate workspace. Usernames are unique within the browser’s Leafmark database.

Removing site data can remove every local profile and journal. Account export and restore are tracked separately. A local profile cannot be moved to a new device by signing in.

## Book search

Catalog search uses the [public Google Books volumes list endpoint](https://developers.google.com/books/docs/v1/reference/volumes/list). Search requires an internet connection, but it does not create a Leafmark account or send reading-journal data. Selected book details are copied into the local account's editable Book record; manual entry remains available.

## Verify local behavior

`npm run typecheck` checks TypeScript. `npm test` runs unit and app-flow tests. `npx playwright test` runs PWA tests against a local exported site, including account creation, sign-in, workspace separation, reload persistence, storage-status behavior, and offline app-shell loading. The manual iPad walkthrough verifies Safari Home Screen installation, standalone launch, two-profile switching, workspace separation, saved data after closing and reopening Leafmark, and the displayed storage grant.

The earlier React Native and Expo implementation remains shelved source code. Its native local SQLite account implementation is not the active PWA storage path.
