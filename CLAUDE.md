# ZIVO App Foundation
A dark, mobile-first social video app with five primary tabs and routed creator, community, and content experiences.

## Masterplan

- Keep Home, Shorts, Create, Discover, and Profile within immediate reach on mobile.
- Make public browsing available without sign-in; require an account for personalized and creator actions.
- Grow the foundation through routed experiences for content, communities, live sessions, messages, notifications, and creator tools.
- Preserve upload activity across navigation; uploaded media is stored as private drafts.

## Tech Stack & Architecture

- **Frontend:** React 19, TypeScript, Vite, React Router, Tailwind CSS, and Lucide icons. Manrope is loaded from Google Fonts in `index.html`.
- **Routing and shell:** `src/main.tsx` mounts the app and providers; `src/App.tsx` defines routes. Main routes render through `src/components/AppShell.tsx`, which owns the shared header, outlet, bottom navigation, and upload context. Authentication routes are outside the shell.
- **State:** Keep local UI state in pages and components, shared interaction logic in `src/hooks/`, and platform operations in `src/lib/`. `src/auth/AuthProvider.tsx` owns session state and exports `useAuth()`.
- **Backend:** Use the GenMB SDK injected by `index.html` for auth, data, storage, and functions. SDK typings are in `src/types/genmb.d.ts`. There is no separate ZIVO REST API; route backend work through the SDK.
- **Auth/RBAC:** Set the role loader before awaiting `window.genmb.auth.ready()`. Read the user after auth initialization. Role readiness is independent so public pages do not wait on permission checks.
- **Android/PWA:** `capacitor.config.ts` loads the deployed HTTPS app URL in Android’s WebView. Deploy the app and SDK/API endpoints on that origin. `public/zivo-sw.js` deliberately bypasses navigation and auth/API requests; bump `CACHE_NAME` when changing shell caching.
- **Build caveat:** `scripts/build-android-apk.sh` requires a complete Vite project, installed Capacitor dependencies, Android SDK, JDK 17+, and `ZIVO_PRODUCTION_URL`. This supplied snapshot lacks `package.json`; restore the project manifest before running npm or Android builds.

## File Structure

```text
index.html                              # App metadata, Manrope font, manifest, and GenMB SDK injection.
capacitor.config.ts                    # Android WebView app identity and hosted URL configuration.
public/manifest.json                   # Installable ZIVO app metadata and icons.
public/zivo-sw.js                      # PWA asset cache; navigation and API requests bypass cache.
public/icons/                          # ZIVO SVG icons, including the maskable icon.
scripts/build-android-apk.sh           # Vite build, Capacitor sync, and debug APK build.
.github/workflows/android_apk.yml      # APK workflow copy; verify this is the active GitHub workflow.
github/workflows/android-apk.yml       # Duplicate workflow path; GitHub Actions normally uses `.github/workflows/`.
functions/resolveRole.ts               # GenMB role resolver: owner is admin, other signed-in users are viewers.
src/main.tsx                            # React entry point and global providers.
src/App.tsx                             # Sign-in, app, and not-found route definitions.
src/auth/AuthProvider.tsx               # Auth initialization, session state, and RBAC setup.
src/components/AppShell.tsx             # Shared header, page outlet, navigation, and upload persistence.
src/components/ZivoHeader.tsx           # ZIVO branding and secondary navigation.
src/components/BottomNavigation.tsx     # Five primary tabs and elevated Create control.
src/components/BackgroundUpload.tsx     # Upload context that survives route changes.
src/components/                          # Shared dialogs, players, safety, and UI state components.
src/hooks/                               # Reusable page and interaction state.
src/lib/                                 # GenMB-backed domain operations and utilities.
src/pages/                               # Route-level screens for tabs and secondary experiences.
src/styles/main.css                      # Global styles, theme, and responsive app styling.
src/types/genmb.d.ts                     # GenMB SDK TypeScript declarations.
```

## Key Features

- **Primary navigation:** `src/components/BottomNavigation.tsx` links Home (`/`), Shorts (`/shorts`), Create (`/create`), Discover (`/discover`), and Profile (`/profile`). Create is visually elevated; active state is route-aware.
- **Route shell:** `src/components/AppShell.tsx` wraps standard pages with the header and bottom bar. Shorts intentionally occupies the full viewport and hides both; Create gets dedicated page-content styling.
- **Routed experiences:** `src/App.tsx` includes content and Shorts detail routes, communities, live sessions, messages, notifications, and creator monetization, analytics, and studio pages. Keep authentication routes outside the shell.
- **Auth and permissions:** `src/auth/AuthProvider.tsx` initializes SDK session state and RBAC. `functions/resolveRole.ts` returns `admin` with all permissions only for platform owners; other authenticated users get `viewer` with no permissions.
- **Persistent interactions and domain services:** Hooks and `src/lib/` cover profiles, posts, likes, comments, follows, safety, search, sharing, live, messages, notifications, communities, and creator tools. Use these modules rather than embedding platform calls in presentation components.
- **Media uploads:** `BackgroundUpload` is mounted above the route outlet so active work survives navigation. Store uploads as private drafts.
- **Data tables:** `appSettings` stores `id`, `appName`, `startUrl`, `displayMode`, and `themeColor`. `profiles` stores `id`, `userId`, `displayName`, `bio`, and `avatarUrl`.
- **External integrations:** GenMB SDK provides auth, RBAC, relational data, functions, storage, and other enabled platform capabilities. Do not introduce separate REST endpoints without an explicit product decision.

## Design Guidelines

- Use a premium dark social-media visual language with high-contrast text, restrained borders, blurred elevated surfaces, and pink/blue ZIVO accents.
- Use Manrope and existing theme tokens/utilities; avoid hardcoded colors where shared tokens apply.
- Design mobile-first, including Android safe areas (`env(safe-area-inset-bottom)`) and touch-sized controls. Let wide content remain centered and constrained rather than stretching mobile layouts.
- Preserve keyboard focus visibility and accessible labels for navigation and icon-only controls.
- PWA metadata currently declares white `theme_color` and `background_color` in `public/manifest.json`; coordinate any changes with browser and installed-app behavior.

## App Flow

- The root route opens Home inside the shared shell. The bottom bar switches between the five primary destinations.
- Shorts detail (`/shorts/:contentId`) and the Shorts feed use the full-screen Shorts layout; content details use `/content/:contentId`.
- Secondary destinations—including `/communities`, `/live/:liveSessionId`, `/messages`, `/notifications`, and `/creator/*`—remain within the app shell.
- `/sign-in`, `/sign-up`, and `/forgot-password` render outside the shell. Public browsing should not be blocked by RBAC readiness.
- Unknown routes render `NotFoundPage`. `AppErrorBoundary` contains rendering failures and offers a full refresh.
- Android’s APK opens the configured hosted origin, not a locally bundled offline app. Ensure that origin serves the current app and GenMB API before distributing builds.

## Conventions

- Use React function components, TypeScript, and named/default exports consistent with neighboring files. Keep route screens in `src/pages/`, shared UI in `src/components/`, reusable state in `src/hooks/`, and platform/domain operations in `src/lib/`.
- Use React Router paths from `src/App.tsx`; add navigation links through `NavLink` or router APIs, not hard-coded full-page reloads.
- Keep shared shell behavior in `AppShell.tsx`. If a route needs a different viewport treatment, add an explicit pathname condition there rather than duplicating the shell.
- Prefer existing Tailwind utilities and theme tokens; use `src/styles/main.css` for global rules and specialized responsive behavior.
- For a new feature: implement domain operations in `src/lib/`, reusable state in a hook where appropriate, build the route screen in `src/pages/`, register it in `src/App.tsx`, and add shell navigation only if it is a primary destination.
- Keep SDK calls typed using `src/types/genmb.d.ts`. Handle loading, empty, and failure states in the UI; never make public screens wait on optional role resolution.

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
