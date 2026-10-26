# Local accounts and iPad-only delivery

Leafmark's first release is an iPad app built with React Native and Expo. It stores local username-and-password accounts and each account's reading journal in the app's on-device SQLite database. Every workspace is scoped to its local account. The password verifier is salted and derived with PBKDF2; the active local account ID is stored with iOS SecureStore.

The app has no application backend, Clerk or Supabase integration, cloud account, or cross-device synchronization. A local account exists only on the iPad where it was created. Password recovery and account transfer are not in the first release. Keep Android out of the current delivery target; revisit it only after the iPad release has been evaluated.

This decision superseded the earlier Clerk/Supabase and Android-later direction in issue #1. ADR-0004 supersedes this delivery choice for active work; this document remains the account and storage decision for the shelved native source.
