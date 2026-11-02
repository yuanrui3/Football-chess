# Football Chess mobile development

This checkout starts from the complete Sites version 76 source, commit 6a2105cf22b21c7d4d9fa7263c82ac230fbccf42. The web game remains in dist/. The Android and iOS apps bundle the same directory through Capacitor 8.6.0. No web compilation step is required for this static JavaScript project.

## Project identity

- Display name: Football Chess
- Android application ID and iOS bundle identifier: com.yuanrui.footballchess
- Native app version starts at 1.0; version 76 identifies the imported web release.
- The identifier is a development choice and can be finalized before store distribution.

## Android on Windows

Open the android/ directory with Android Studio, allow Gradle sync to complete, select an emulator or connected Android phone, and run the app target.

This PC uses a project-local Java 21 toolchain selected in Android Studio through GRADLE_LOCAL_JAVA_HOME. The existing Java 25 runtime continues to run Android Studio. Local SDK and Java paths are ignored by Git.

For shared game changes, use Node.js 22 or newer and pnpm 11.25.0:

~~~powershell
pnpm install --frozen-lockfile
pnpm run test:mobile
pnpm run mobile:sync:android
pnpm run android:open
pnpm run android:build
~~~

The source of truth is dist/, not the generated copies under android/app/src/main/assets/public/ or ios/App/App/public/.

## iOS

For your USB-connected Mac and iPhone, follow [free native iPhone testing](IOS-IPHONE-TESTING.md). The helper `bash scripts/prepare-ios-mac.sh` prepares the dependencies and opens Xcode; select your Personal Team in Xcode for device signing.

The ios/ native project is generated here using Swift Package Manager. Build and simulator execution require macOS with Xcode 26 or newer. On a Mac:

~~~sh
pnpm install --frozen-lockfile
pnpm run mobile:sync:ios
pnpm run ios:open
~~~

Open ios/App/App.xcodeproj, select the App scheme, and select an iPhone simulator. A simulator build does not require signing. Installing on an iPhone and TestFlight distribution need Apple signing configuration; none is included in this project.

## Shared workflow

Edit dist/ and the existing tests, run the appropriate tests, then sync each native platform before building. The GitHub Actions workflow under .github/workflows/mobile.yml is configured to build Android and an unsigned iOS Simulator app after the branch is pushed. This setup does not push or publish anything.

The Sites hosting metadata is retained as source provenance. Local native development does not deploy the hosted game.

## First device checks

Verify tap selection and pitch layout, exercises, Tactical AI workers, commentary after a user tap, save/reload, pause/resume, Android Back navigation, and iPhone safe areas. Bundled audio is local. Google Fonts is currently an optional remote stylesheet dependency with local fallback fonts. Browser saves from the hosted site do not automatically transfer to a separately installed app.

## Build verification

The focused game and bundled-audio checks are available with `pnpm run test:mobile`. Local build and native device results are recorded in MOBILE-STATUS.md. The full existing AI/training test suite is separate and can be run with `pnpm test` when needed.

On this Windows PC, Java networking required IPv4. The local Android command sets the JVM launcher option, and the project Gradle daemon uses the same setting. The wrapper download timeout is 60 seconds.

The Windows Android command also places temporary JVM selector sockets under the ignored .mobile-build/s directory. This avoids an AppData socket failure in the Codex launch context; it changes only the launched process environment.

## Windows terminal launcher

On this PC, Node and pnpm are available through the Codex-managed runtime. In a normal Windows terminal, use the project launcher, which locates that runtime automatically (and falls back to a system pnpm installation elsewhere):

~~~powershell
cd "C:/Users/flexadmin/Documents/ChatGPT/Football chess game"
.\mobile.cmd run mobile:sync
.\mobile.cmd run android:open
.\mobile.cmd run android:build
~~~

You can also open the android/ directory directly in Android Studio.
