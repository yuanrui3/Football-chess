# Mobile setup status — 2026-11-03

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

## Free iPhone testing handoff — 2026-11-01

- User reports that the Safari version has already worked well on the iPhone.
- User selected free native testing on a Mac accessible by USB to the iPhone, using an Xcode Personal Team.
- Current project uses automatic signing with no hardcoded Apple team and no restricted capabilities identified.
- Added IOS-IPHONE-TESTING.md and scripts/prepare-ios-mac.sh. The helper prepares the locked dependencies and shared iOS assets, then opens the SPM Xcode project. Apple account login, team selection and phone confirmations remain interactive on the Mac/iPhone.
- Helper shell syntax passed Git Bash validation on Windows. The helper and native app have not yet been run on the user's Mac or iPhone.
- Free device provisioning lasts seven days; repeat the Xcode build/install to renew it.

## Mac preparation — 2026-11-02

- Checked out `mobile/capacitor` at `6d7dcbc` on the user's Mac.
- Installed a project-local Node.js 24.22.2 runtime, verified against the official Node distribution SHA-256 checksum, and installed the frozen dependencies with pnpm 11.25.0.
- Focused mobile checks on the Mac: **82 passed, 0 failed**.
- `cap sync ios`: **PASS**. Generated iOS assets match the checked-in project; no native source changes were needed.
- Installed and opened Xcode 27.2 (27B52); the iOS 27.2 SDK is available and first-launch checks passed.
- Native Debug build for generic iOS/arm64: **PASS** with `CODE_SIGNING_ALLOWED=NO`. This verifies compilation for a physical iPhone target; signing, installation and gameplay on the phone remain unverified. Local output is `.mobile-build/ios-device-build/Build/Products/Debug-iphoneos/App.app`, with the build log at `.mobile-build/ios-device-build.log`.
- A local, ignored launcher at `.mobile-build/prepare-ios.command` selects the project-local Node runtime and the full Xcode developer directory, then runs the existing preparation helper. Open it from Finder or run `bash .mobile-build/prepare-ios.command` from this checkout. The system-wide developer-tool selection remains Command Line Tools.
- The user selected a Personal Team and paired an iPhone 17 running iOS 26.6.2. Developer Mode was enabled and compatible developer disk-image services are usable.
- Xcode created the development provisioning profile. The user completed signing-key authorization; the signed iPhone build **PASSED** and the entire app passed `codesign --verify --deep --strict`. The original login keychain was not reset.
- Installation and launch on the paired iPhone 17: **PASS** after the user trusted their developer profile. The app process remained running after launch.
- On-device basic gameplay: **PASS, user-confirmed**. The game displayed correctly, an untimed local match started, and one pass completed.
- The user supplied a landscape screenshot showing the square grid and pieces overflowing the smaller pitch frame/SVG into the right panel and below the board. Checking only the parent grid/SVG bounds had missed the overflowing grid tracks. Exercise, commentary and background-resume checks were subsequently confirmed on 2026-11-03; see the completed device checks below.
- The installed free development profile expires **2026-11-09 at 7:08 PM America/Indiana/Indianapolis**. Rebuild and reinstall with the Personal Team to renew it.
- The user unplugged the iPhone after the initial session and reconnected it on 2026-11-03 for installation and verification of the corrected build below.


## Landscape grid correction — 2026-11-02

- Updated `dist/style.css`: give all 14 columns and 17 rows zero minimum grid tracks, allow cells to shrink, and remove the cell-level aspect ratio. The parent pitch already defines the 14:17 ratio; cell contents must not set the board dimensions.
- Updated the stylesheet content version in the match, exercises and commentary-audition pages so cached CSS cannot keep the previous rules.
- Browser regression: a local-only fixture with 62 px landscape side margins and deliberately oversized 32 px piece glyphs reproduces the original failure mechanism. Before: a 476 × 578 px cell grid overflows a 259 × 314.5 px pitch. After: the cell grid is exactly 259 × 314.5 px. This is a sizing stress case, not a claim to reproduce every iOS rotation timing condition.
- Checked all 238 individual square positions and dimensions in a paused watch match at 874 × 402, 402 × 874, back to 874 × 402, and 1366 × 900. Also checked the exercise board at landscape → portrait → landscape. All square geometry errors were below 0.01 CSS px; pitch and SVG bounds matched. The corrected paused board was visually inspected, with no grid overflow and no browser console errors.
- `cap sync ios`: **PASS**. After the user approved the macOS signing-key dialog, the updated signed native build **SUCCEEDED** and `codesign --verify --deep --strict` **PASSED**. All four corrected web assets match the built app bundle. Build log: `.mobile-build/ios-layout-fix-build.log`.
- Installed and launched the corrected build on the physical iPhone 17 on **2026-11-03**: **PASS**. Local deployment records: `.mobile-build/iphone-layout-fix-install.json` and `.mobile-build/iphone-layout-fix-launch.json`.
- Physical iPhone landscape regression: **PASS, user-confirmed 2026-11-03**. After landscape → portrait → landscape rotation, squares and pieces stay within the pitch frame immediately; the larger overlapping box no longer appears.
- Remaining device checks completed on **2026-11-03**, all **PASS, user-confirmed**: exercise Play solution, commentary audio via Test Adam after a tap, and leaving/reopening the app.
- Planned physical iPhone smoke checks are complete: basic local match and pass, immediate landscape alignment through rotation, exercise solution playback, commentary audio, and app background/resume. These results cover the checks performed, not exhaustive validation of every game mode or audio-interruption scenario.

- The user paused further testing on **2026-11-03** after the planned checks passed. Optional next checks: force-close saved-match recovery, full match/goal-replay flow, offline operation, match export/import, and audio interruptions.
