# Free native iPhone testing on a Mac

Use the Mac you can connect your iPhone to by USB. This tests the native Football Chess app using your free Apple Account and Xcode Personal Team. A paid Apple Developer Program membership is not required for this route. Free device provisioning expires after seven days; build and install again to renew it.

## Which version is this?

The source is **Sites beta version 76**, plus the shared Android/iOS packaging and mobile touch/safe-area adjustments. It is on GitHub branch `mobile/capacitor`. The first successful cloud build compiled commit `b7be601cb80a2ae45ac99711b59e268f92838892`; later documentation/helper commits do not change the game engine. The older GitHub `main` branch was not used as the mobile source.

Use a source checkout for the steps below. The downloaded iOS Simulator artifact is a different build target and cannot be installed on the iPhone.

## Before starting on the Mac

- Install the full **Xcode 26 or newer** and finish its first-launch components. Choose an Xcode version compatible with both the Mac's macOS and the iPhone's iOS version. Check [Apple's Xcode requirements](https://developer.apple.com/xcode/system-requirements/).
- Install **Node.js 22 or newer**. Node 24 matches our successful cloud build. The helper uses pnpm 11.25.0, through npm/npx if needed.
- Have a USB cable that supports data, your unlocked iPhone, and your Apple Account available.

## 1. Get the mobile branch

In a Mac Terminal, in the parent directory where you want the project:

```sh
git clone --branch mobile/capacitor --single-branch https://github.com/yuanrui3/Football-chess.git
cd Football-chess
bash scripts/prepare-ios-mac.sh
```

The helper checks the tools, installs the locked JavaScript dependencies, copies the current web game into the iOS project, and opens `ios/App/App.xcodeproj`. This project uses Swift Package Manager; CocoaPods is not needed. No Apple account or signing operation is automated by the helper.

If this branch is already cloned, use that checkout and pull its latest changes before running the helper.

## 2. Select your free signing team in Xcode

1. Open **Xcode > Settings > Accounts** (or Apple Accounts) and sign in personally with your Apple Account.
2. Select the blue **App** project, then the **App target**.
3. Open **Signing & Capabilities** and keep **Automatically manage signing** enabled.
4. Select your **Personal Team** in the Team dropdown.
5. Keep the current bundle identifier, `com.yuanrui.footballchess`, unless Xcode reports it unavailable. If it does, use a unique development identifier for your team.

The cloud Simulator workflow uses signing-disabled build arguments. Those arguments are not used for this local iPhone build; Xcode handles development signing here.

## 3. Connect the iPhone and run

1. Connect your unlocked iPhone to the Mac using USB and complete **Trust This Computer** on the iPhone.
2. Allow Xcode to pair and prepare the device. If prompted, enable **Settings > Privacy & Security > Developer Mode** on the iPhone, restart the iPhone, and confirm the setting. The option may appear after pairing begins. This restart is on the iPhone, unrelated to the pending Windows emulator restart.
3. In Xcode, select the **App** scheme and your physical iPhone as the run destination.
4. Press **Command-R**. Xcode should sign, install, and launch Football Chess.

If the installed app shows an **Untrusted Developer** message, on the iPhone open **Settings > General > VPN & Device Management**, choose your Apple Account under **Developer App**, and complete the Trust/verification prompts. Keep the phone connected to the internet for verification, then retry launching the app. This approval is separate from trusting the Mac over USB and enabling Developer Mode.

On the Mac, code signing may also ask for access to the **Apple Development** key in the login keychain. Enter the keychain password only in the macOS dialog (normally your Mac login password). Choosing Allow can produce another prompt for each component; Always Allow remembers access for the requesting signing tool. Do not reset the keychain just to resolve a signing prompt.

If the phone is unavailable in the destination menu, read Xcode's displayed reason. An iOS version newer than that Xcode supports requires a compatible newer Xcode/macOS combination. Resolve any signing error in Signing & Capabilities before retrying.

## First phone test

- Start an untimed local match; select pieces, complete a pass, and try a legal move.
- Check the board and action buttons in portrait and landscape, including notch/home-indicator spacing.
- Try Casual and Tactical opponents, then Coach mode.
- Enable commentary at Relaxed pace and test Adam after a user tap. Check complete calls and interruption handling.
- Open an exercise and play its example solution.
- Background and reopen the app, then relaunch it to verify saved-match restoration and safe pause behavior.
- Try a bundled-audio match with the network unavailable. The game/audio files are bundled; Google Fonts currently has a local fallback.

Record the iPhone model, iOS version, Xcode version, and any observed problem. Current device results are recorded in MOBILE-STATUS.md.

## Official references

- [Apple Personal Team testing and seven-day limits](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [Run an app on a connected device](https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html)
- [Enable Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
- [Capacitor iOS setup](https://capacitorjs.com/docs/ios)
