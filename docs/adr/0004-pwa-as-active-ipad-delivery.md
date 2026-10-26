# Use an offline-first PWA for active iPad delivery

Status: accepted

## Context

The reader wants Leafmark on a personal iPad without recurring developer-signing renewal, an App Store release, a paid runtime, an online account, or device synchronization. The journal must reopen after the PWA or iPad is closed, work offline after the first site visit, and move to a reset or replacement iPad through an explicit backup.

The earlier React Native and Expo app remains valuable source code, but its native installation path does not meet the reader's personal-installation needs. The repository can be public, while the reading journal remains private on the device.

## Decision

Make a static, installable iPad Safari PWA the active Leafmark product and publish its application files with GitHub Pages. Use a service worker to cache the application shell and static assets. The first site visit and code updates require an internet connection; journal workflows remain available offline after the app shell is cached.

Use IndexedDB for local profiles and all journal state. Keep account credentials and workspaces on the current device, request persistent origin storage when launched from the Home Screen, and show the storage state. Use Google Books only as an optional direct catalog request; all returned details are saved locally and can be edited. Do not add a Leafmark server, paid service, cloud account, or synchronization.

Add an explicit versioned export and restore flow for transferring the complete journal and its media through iPadOS Files. Validate a backup before changing local state and require confirmation before replacing existing data.

Preserve the React Native and Expo implementation as shelved native source. Do not add Android delivery as part of this work.

## Consequences

- A public static site can be installed from Safari and opened in standalone mode without App Store distribution.
- IndexedDB persistence and the WebKit storage-retention grant are device and browser managed. A reset, deliberate website-data deletion, or unsuccessful persistent-storage request makes a saved backup important for transfer and recovery.
- GitHub Pages serves application files only. It must not receive account credentials, reading history, private Book page content, or illustrations.
- The existing native account and SQLite implementation remains source-only while the PWA is the product being completed.
