# ZIVO App Foundation
A dark, mobile-first social video app for discovering content and navigating creator features from one persistent five-tab shell.

## Masterplan

- Make Home, Shorts, Create, Discover, and Profile immediately accessible, especially on Android-sized screens.
- Let visitors browse public content while requiring sign-in for account and creator actions.
- Grow the foundation through dedicated routes for content, communities, live sessions, messages, notifications, and creator tools.
- Keep uploads active while users navigate; store uploaded media as private drafts.

## Tech Stack & Architecture

- **Frontend:** React 19, TypeScript, Vite, React Router, Tailwind CSS, and Lucide icons. Manrope is loaded from Google Fonts in `index.html`.
- **App wiring:** `src/main.tsx` mounts the app and providers. `src/App.tsx` declares routes. Routes inside `AppShell` share the header, page outlet, bottom navigation, and upload context; sign-in routes are outside the shell.
- **State:** Keep page-specific state in components, reusable behavior in `src/hooks/`, and platform operations in `src/lib/`. `src/auth/AuthProvider.tsx` owns session state.
- **Platform and API:** The GenMB SDK is injected through `index.html`, with TypeScript declarations in `src/types/genmb.d.ts`. Use GenMB directly; there is no separate ZIVO REST API. `functions/resolveRole.ts` returns 401 when signed out, grants the platform owner `admin` with `['*']`, and gives other signed-in users `viewer` with no permissions.
- **Auth initialization:** In `src/auth/AuthProvider.tsx`, register the RBAC role loader before awaiting `window.genmb.auth.ready()` and `window.genmb.rbac.ready()`. Read the current user only after auth initialization.
- **PWA and Android:** `public/zivo-sw.js` caches eligible same-origin GET resources network-first, but bypasses navigations and auth/API URLs. Increment `CACHE_NAME` when changing shell caching. `capacitor.config.ts` requires canonical HTTPS `ZIVO_PRODUCTION_URL`; Android loads the hosted app rather than the bundled `dist`, so deployment must provide GenMB.
- **Known database tables:** `appSettings` (`id`, `appName`, `startUrl`, `displayMode`, `themeColor`) and `profiles` (`id`, `userId`, `displayName`, `bio`, `avatarUrl`). Inspect the relevant operation in `src/lib/` before assuming or changing schemas.

## File Structure

```text
index.html                            # Metadata, Manrope, PWA manifest, and injected GenMB SDK.
package.json                          # Dependencies and development, build, and Android scripts.
capacitor.config.ts                  # Hosted HTTPS URL configuration for Android.
functions/resolveRole.ts             # GenMB RBAC role resolution.
public/manifest.json                 # Installable app metadata and icons.
public/zivo-sw.js                    # Service worker caching and navigation/API bypass rules.
src/main.tsx                         # React entry point and global providers.
src/App.tsx                           # Sign-in, tab, content, community, live, and creator routes.
src/auth/AuthProvider.tsx            # Session and RBAC initialization; exports `useAuth()`.
src/components/AppShell.tsx          # Shared shell; hides header and bottom nav on Shorts.
src/components/ZivoHeader.tsx        # ZIVO branding and secondary navigation.
src/components/BottomNavigation.tsx  # Five tabs with elevated center Create action.
src/components/BackgroundUpload.tsx  # Shell-persistent uploads and private-draft saving.
src/components/AppErrorBoundary.tsx  # Contains render failures and offers refresh recovery.
src/components/ZivoState.tsx         # Shared loading, empty, and error states.
src/pages/                            # Tab screens, auth, content, communities, live, and creator tools.
src/hooks/                            # Shared engagement, safety, and page metadata behavior.
src/lib/                              # GenMB-backed content, profiles, search, sharing, and safety operations.
src/styles/main.css                  # Theme tokens, surfaces, layout, and animations.
src/types/genmb.d.ts                 # GenMB SDK type declarations.
```

## Key Features

- **Five-tab navigation:** `src/components/BottomNavigation.tsx` links Home (`/`), Shorts (`/shorts`), Create (`/create`), Discover (`/discover`), and Profile (`/profile`). Create is visually elevated as the central action.
- **Responsive app shell:** `src/components/AppShell.tsx` keeps header and navigation persistent across standard routes. Shorts intentionally occupies the viewport without either.
- **Browse and creator destinations:** `src/App.tsx` includes routes for content, live sessions, communities, messages, notifications, profiles, and creator studio, analytics, and monetization.
- **Background uploads:** `src/components/BackgroundUpload.tsx` keeps upload jobs available across route changes, reports progress/errors, checks the initiating user’s session, and saves successful uploads as private drafts. Uploads started without a signed-in user do nothing.
- **Profile and content operations:** `src/lib/profiles.ts`, `src/lib/posts.ts`, and other `src/lib/` modules contain GenMB-backed operations. Do not infer database schema from UI or add a parallel REST API.
- **Safety and engagement:** Shared hooks and components cover likes, comments, follows, sharing, and safety controls; preserve their existing platform-backed behavior when changing pages.
- **PWA and install:** `public/manifest.json`, `public/icons/`, `public/zivo-sw.js`, and `src/components/InstallZivoButton.tsx` support installation. Service-worker caching deliberately avoids HTML navigation and auth redirects.

## Design Guidelines

- Use the premium dark palette defined in `src/styles/main.css`, with `#14121b` as the app theme/background and pink/blue accents reflected in the ZIVO icon.
- Use Manrope, loaded in `index.html`; prefer clear, compact typography suitable for phone screens.
- Favor rounded surfaces, restrained borders, blur, and soft accent glow. Reuse theme tokens and existing utility classes rather than introducing unrelated colors.
- Keep layouts mobile-first, respect safe-area insets, and ensure page content clears the fixed bottom navigation. Shorts is the intentional full-viewport exception.
- Maintain visible keyboard focus and accessible labels for navigation and controls.

## App Flow

- Opening `/` shows Home within the shared shell. The five-tab navigation moves between the primary destinations.
- Selecting Shorts opens the full-viewport feed; its route variant `/shorts/:contentId` is also supported. Other content opens at `/content/:contentId`.
- Selecting Create opens `/create`; signed-in upload jobs can continue while navigating and appear in the shell until completion, failure, or dismissal by the existing timeout behavior.
- Profile opens `/profile`; `/profile/:userId` supports another user’s profile. Sign-in, sign-up, and password recovery routes render outside the app shell.
- Secondary destinations include `/communities`, `/messages`, `/notifications`, `/live/:liveSessionId`, and `/creator/*`.
- Unknown paths render `NotFoundPage`. Render failures are contained by error boundaries with refresh recovery.
- Do not serve cached HTML for OAuth callbacks, auth/API routes, or app navigations; stale cached shells can break sign-in redirects.

## Conventions

- Use TypeScript and React function components. Keep route definitions in `src/App.tsx`; put route UI in `src/pages/`.
- Use `src/components/` for shared UI, `src/hooks/` for reusable behavior, and `src/lib/` for GenMB-backed operations. Prefer existing shared loading/error states and `cn()` from `src/lib/utils.ts`.
- Follow existing Tailwind and `src/styles/main.css` theme conventions; avoid duplicating shell/navigation styles in pages.
- To add a page or feature: add the page under `src/pages/`, register its route in `src/App.tsx`, add navigation only when it belongs in primary or secondary navigation, and place reusable platform operations in `src/lib/`.
- Keep sensitive actions session-aware and handle loading, empty, and failure states. Do not add auth, database, or service behavior outside the established GenMB integration.
- When changing PWA shell assets, update `CACHE_NAME` in `public/zivo-sw.js`. Validate Android builds with `ZIVO_PRODUCTION_URL` set to the deployed HTTPS app URL.

## Platform (GenMB)

This app is built and hosted on GenMB.

**Runtime:** Browser sandbox (iframe) or Cloud Run. No Node.js server — all code runs client-side unless `backend/` exists.

**Dependencies:** CDN-only (esm.sh, cdn.tailwindcss.com, unpkg). Use ES module imports with full CDN URLs. No `npm install` at runtime.

**Entry point:** `index.html` must include all CDN script tags. Tailwind via CDN with inline config.

**Built-in services (relative API paths only, never hardcode domains):**
- `/api/ai/completion` — AI proxy | `/api/data/{appId}/*` — PostgreSQL (DataConnect SDK)
- `/api/storage/{appId}/*` — File uploads (GCS) | `/api/auth/google/*` — Google OAuth
- `/api/contact/submit` — Contact form | SDKs: `window.genmb.db`, `.storage`, `.auth`

**File structure:** `index.html` (entry), `src/` (source), `styles/` (CSS), `backend/` (optional FastAPI), `CLAUDE.md` (this file).

**Cannot:** Install npm packages at runtime, access filesystem, make direct server-side calls from frontend, modify infra.
