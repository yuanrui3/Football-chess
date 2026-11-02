#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' 'Run this helper on the Mac that will be connected to your iPhone.' >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  printf '%s\n' 'Install and open the full Xcode app first, then select its Command Line Tools in Xcode Settings > Locations.' >&2
  exit 1
fi
if ! XCODE_INFO="$(xcodebuild -version 2>&1)"; then
  printf '%s\n' "$XCODE_INFO" 'Finish Xcode first-launch setup and retry.' >&2
  exit 1
fi
XCODE_MAJOR="$(printf '%s\n' "$XCODE_INFO" | awk '/^Xcode / { split($2, version, "."); print version[1]; exit }')"
if [[ ! "$XCODE_MAJOR" =~ ^[0-9]+$ ]] || (( XCODE_MAJOR < 26 )); then
  printf '%s\n' 'Football Chess with Capacitor 8 needs Xcode 26 or newer. Use a version that also supports your iPhone iOS version.' >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 22 or newer on this Mac first. Node 24 matches the successful cloud build.' >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 22 )); then
  printf '%s\n' 'Node.js 22 or newer is required.' >&2
  exit 1
fi

PNPM=(pnpm)
if ! command -v pnpm >/dev/null 2>&1 || [[ "$(pnpm --version)" != "11.25.0" ]]; then
  if ! command -v npx >/dev/null 2>&1; then
    printf '%s\n' 'Install pnpm 11.25.0 or use a Node installation that includes npm/npx, then retry.' >&2
    exit 1
  fi
  PNPM=(npx --yes pnpm@11.25.0)
fi

printf '%s\n' "$XCODE_INFO" "Preparing Football Chess from: $PROJECT_ROOT"
"${PNPM[@]}" install --frozen-lockfile
"${PNPM[@]}" exec cap sync ios
open "$PROJECT_ROOT/ios/App/App.xcodeproj"
printf '\n%s\n' \
  'Xcode is open. Sign into your Apple Account in Xcode Settings, then select App > Signing & Capabilities > your Personal Team.' \
  'Connect and unlock your iPhone, complete Trust/Developer Mode prompts on the phone, select it as the run destination, and press Command-R.' \
  'Free Personal Team provisioning expires after seven days. Rebuild and install again when needed.'
