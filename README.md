# ZIVO App Foundation

A dark, mobile-first ZIVO social video app shell with a branded header, responsive bottom navigation, and polished placeholder screens for Home, Shorts, Create, Discover, and Profile.

## Generated with GenMB

This project was generated using [GenMB](https://genmb.com) - AI-powered application builder.

### Original Prompt

> Build the initial ZIVO app foundation.

Create a clean, professional, mobile-first social video app called ZIVO.

For this step ONLY:

- Create the main app structure and navigation.
- Add a bottom navigation bar with: Home, Shorts, Create, Discover, Profile.
- Create a simple ZIVO logo/text header.
- Make the UI modern, fast and responsive on Android phone screens.
- Use a dark premium social-media style.
- Create placeholder screens for each navigation item.
- Do NOT add authentication, database, messaging, payments, AI features, or video upload yet.

Focus only on the frontend foundation and navigation. Keep the implementation simple and production-ready.

## Getting Started

### Prerequisites

- Node.js 18+

### Running Locally

```bash
npm install
npm run dev
```

## Framework

This project uses **React-Ts**.

## Progressive Web App (PWA)

This app is PWA-enabled and can be installed on mobile devices!

### PWA Files Included

- `manifest.json` - App manifest for installability
- `service-worker.js` - Caching and offline support
- `offline.html` - Offline fallback page
- `install-prompt.js` - "Add to Home Screen" install banner

### Installing on Mobile

1. Open the deployed app in your mobile browser
2. A custom install banner will appear after 2 seconds
3. Tap "Install" to add the app to your home screen
4. On iOS: Tap the share button and select "Add to Home Screen" (iOS shows instructions)

### Testing PWA Locally

PWA features require HTTPS to work. For local testing:

```bash
# Option 1: Use a local HTTPS server
npx local-web-server --https

# Option 2: Use Chrome's DevTools
# Open DevTools > Application > Service Workers
# Check "Bypass for network" to test offline mode
```

## License

MIT
