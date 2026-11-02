# Mobile setup status — 2026-11-01

- Imported complete Football Chess Sites version 76, source commit 6a2105cf22b21c7d4d9fa7263c82ac230fbccf42.
- Development branch: mobile/capacitor. GitHub origin: yuanrui3/Football-chess. Cloud build results are available in the repository Actions tab.
- All version 76 source assets were imported. The three HTML entry points now load an added mobile.css stylesheet and use viewport-fit=cover. Engine, AI, commentary and exercise logic remain unchanged. Both native bundles have been synchronized with these mobile presentation changes.
- Capacitor core, CLI, Android and iOS pinned to 8.6.0; pnpm pinned to 11.25.0 with lockfile.
- App ID: com.yuanrui.footballchess. Display name: Football Chess.
- Android native project generated; Java 21 toolchain and SDK 36 installed. Local SDK/Java settings and build artifacts are ignored by Git.
- Android debug build: PASS (assembleDebug). APK at android/app/build/outputs/apk/debug/app-debug.apk.
- Focused engine, midfield-exercise and Adam audio checks: 82 passed, 0 failed. Full AI/training suite was not run for this setup.
- iOS native SPM project compiled successfully on the GitHub macOS runner with Xcode 26.0.1. The unsigned Simulator app includes arm64 and x86_64. iPhone signing, installation and runtime tests remain separate.
- Parallel Android/iOS GitHub Actions workflow is configured at .github/workflows/mobile.yml and runs when this branch is pushed.
- Android Studio opens the native project and completes Gradle sync. Device Manager identified Windows Hypervisor Platform as disabled. With explicit user approval, it was enabled through Android Studio on 2026-11-01; Android Studio reports a restart is required to complete the update. The user will restart manually. Emulator gameplay remains unverified until after that restart.

For commands and platform instructions, see MOBILE.md.

## Browser mobile-readiness pass — 2026-11-01

- Added 44px-high action controls and goal targets on small/coarse-pointer screens, safe-area padding and toast offset, and tap-friendly pitch surfaces. Pitch square geometry is unchanged.
- At 390x844, a local untimed match started, a 100% kickoff pass to the bishop at c5 completed, reload retained the position and paused safely, and Resume restored play.
- All 42 exercises loaded; the first exercise solution played to its final action with no visible error.
- Exercise page horizontal overflow checks passed at 360x800, 430x932, 844x390 and 1280x800. Mobile goal and solution controls measured 44px high. Browser error log was empty during the checks.
- Android debug APK rebuilt successfully after the changes (assembleDebug). iOS source was synchronized; its native cloud build has now passed.
- Landscape presentation and native safe-area/audio behavior still need real device checks. The existing landscape board sizing was left unchanged in this pass.

## First cloud build — 2026-11-01

- Run: https://github.com/yuanrui3/Football-chess/actions/runs/41364459458
- Built source commit: b7be601cb80a2ae45ac99711b59e268f92838892 on mobile/capacitor.
- Android debug APK: SUCCESS.
- iOS unsigned Simulator app: SUCCESS; Xcode 26.0.1; 82 checks passed, 0 failed.
- iOS artifact: https://github.com/yuanrui3/Football-chess/actions/runs/41364459458/artifacts/13106377038 (GitHub retention through November 8, 2026).
- The Simulator artifact is not an installable iPhone/TestFlight build. Gameplay on Android/iOS devices remains unverified.
- User plans to test with an Android phone tomorrow. The pending Windows restart can wait; it is only needed to complete emulator acceleration setup.
