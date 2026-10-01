#!/usr/bin/env bash
# Run locally or on any CI runner; no GitHub Actions workflow is required.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { printf 'ZIVO Android build: %s\n' "$*" >&2; exit 1; }
command -v node >/dev/null 2>&1 || fail 'Node.js is required.'
command -v npm >/dev/null 2>&1 || fail 'npm is required.'
command -v java >/dev/null 2>&1 || fail 'A JDK (17 or newer) is required.'
[[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]] || fail 'Set ANDROID_HOME (or ANDROID_SDK_ROOT) to your installed Android SDK.'
[[ -n "${ZIVO_PRODUCTION_URL:-}" && "$ZIVO_PRODUCTION_URL" =~ ^https://[^[:space:]]+$ ]] || fail 'Set ZIVO_PRODUCTION_URL to the deployed ZIVO HTTPS URL (the app loads this hosted URL).'
[[ ! "$ZIVO_PRODUCTION_URL" =~ ^https://(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$) ]] || fail 'ZIVO_PRODUCTION_URL cannot point to localhost in an APK.'
export ZIVO_PRODUCTION_URL
printf 'Android WebView will load deployed ZIVO from %s (SDK/API calls must stay on that origin).\n' "$ZIVO_PRODUCTION_URL"
[[ -f package.json ]] || fail 'No package.json in this export. Export the full Vite project with its package manifest before running this script.'
[[ -x node_modules/.bin/vite && -x node_modules/.bin/cap ]] || fail 'Install project dependencies first (npm ci if package-lock.json exists, otherwise npm install), including @capacitor/cli and @capacitor/android.'

printf 'Building ZIVO web assets...\n'
./node_modules/.bin/vite build
if [[ ! -d android ]]; then
  printf 'Creating Android project...\n'
  ./node_modules/.bin/cap add android
fi
printf 'Syncing Capacitor Android project...\n'
./node_modules/.bin/cap sync android

[[ -f android/gradlew ]] || fail 'Capacitor did not create android/gradlew.'
chmod +x android/gradlew
printf 'Building debug APK...\n'
(cd android && ./gradlew --no-daemon assembleDebug)
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
[[ -s "$APK" ]] || fail "Build completed but APK was not found at $APK"
printf 'Debug APK ready: %s\n' "$APK"
printf 'This is a debug-signed APK for testing, not a Play Store release.\n'
