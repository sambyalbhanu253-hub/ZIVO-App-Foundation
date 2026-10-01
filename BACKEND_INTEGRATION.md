# ZIVO backend integration

ZIVO currently uses the platform's hosted backend, not Firebase or Supabase. No Firebase/Supabase project, credentials, Android configuration, or schema migration was supplied, so this change does not claim to connect either external provider. Switching providers requires a separately configured project, access rules, migration of existing data and media, and an APK build pointed at the deployed backend.

## Existing hosted services

- **Signups and sessions:** `window.genmb.auth` provides Google, email/password with verification, magic-link login, password reset, and persistent sessions. The auth provider waits for initialization before reading a session. The Android APK must load the deployed app with the platform SDK available; a standalone Vite bundle without that runtime will not provide these services.
- **PostgreSQL:** `window.genmb.db.profiles` stores a signed-in user's personal display name, bio, and avatar URL. The table is server-scoped by `userId`. ZIVO also keeps its existing public profile record in the built-in key-value store for creator handles, channel names, and feed avatars.
- **Cloud video:** the existing creator upload flow sends video and thumbnails to `window.genmb.storage` and stores permanent returned URLs with post metadata. Posts, comments and messages currently use the app's hosted key-value store; these are **not PostgreSQL tables**.
- **Live updates:** open message inboxes and comment threads subscribe to `window.genmb.realtime`. Writes persist first; events signal other open clients to reload. Offline users see stored content on next load, not a replay of realtime events.

## Exact available relational schema

The deployed relational schema is limited to `appSettings` (`id` UUID primary key, `appName` String required, `startUrl` String required, `displayMode` String required, `themeColor` String required; admin-only) and `profiles` (`id` UUID primary key, `userId` String required, `displayName` String required, `bio` String nullable, `avatarUrl` String nullable; user-owned by `userId`). No chat, comment, post or video table is defined. The platform-managed `window.genmb.db` is the client for these tables; no additional tables or columns are introduced here.

## Before a public multi-user launch

**Private chat is not yet secure for a public launch.** Its existing shared key-value records are readable/writable through the shared store; client-side sender/recipient checks and per-user-looking key names are not server-side authorization. The same issue affects owner-only mutations on shared posts/comments. Do not advertise private messages or content ownership as protected until server-enforced per-conversation and per-content permissions are implemented, with an approved expanded schema or server-side functions. Realtime channel subscriptions are notification transport, not an access-control boundary. Verify public link behavior and APK connectivity against the deployed origin on real devices, and perform multi-account authorization testing before release.

If an external provider is specifically required, Supabase or Firebase is an option after providing a configured project and agreeing to the necessary schema and access-policy changes. No secrets should be bundled into the APK.
