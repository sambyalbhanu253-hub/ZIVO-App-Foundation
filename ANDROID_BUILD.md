# ZIVO Android build without GitHub workflows

The GitHub sync warning means the integration can push ordinary project files but **cannot push `.github/workflows/*`** with its current GitHub authorization. A repository-side script cannot grant that permission or trigger GitHub Actions without a workflow already present on GitHub. Keep syncing the normal source files through the existing integration; this script is an alternative for building an APK **locally or on a separately configured CI runner**. It does not automatically run on GitHub pushes.

## Build a test APK

1. Export or clone the complete project, including its `package.json` and dependencies. This editor snapshot does not contain a `package.json`; the script will stop with a clear error if your export also omits it. Ensure the manifest includes Vite, Capacitor CLI, Capacitor Android and the app's other dependencies.
2. Install Node.js, a JDK (17+), and Android Studio/Android SDK. Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to the SDK directory. From the project root, run `npm ci` if a lockfile is available, otherwise `npm install`.
3. Set the canonical *deployed* HTTPS app URL and run:

   ```bash
   export ZIVO_PRODUCTION_URL='https://your-deployed-zivo.example'
   bash scripts/build-android-apk.sh
   ```

The build script runs Vite, creates the Android project if necessary, syncs Capacitor, and runs Gradle `assembleDebug`. Find the test APK at `android/app/build/outputs/apk/debug/app-debug.apk`. Repeat after source changes. `android/` and the APK are generated locally; GitHub sync of source code alone will **not** produce an APK. Android loads `ZIVO_PRODUCTION_URL` at runtime, so deploy the latest web app before testing it. This APK is debug-signed; publishing requires your own release signing process.

To build on another CI system, configure its job to check out the synced repository, install the same prerequisites and dependencies, set `ZIVO_PRODUCTION_URL`, run `bash scripts/build-android-apk.sh`, and archive the APK path above as an artifact. No `.github/workflows` file is needed for that job.

If you specifically need GitHub Actions to trigger on push, a GitHub connection authorized to update workflow files (or an authorized repository administrator adding the workflow) is still required; the script does not bypass that restriction.
