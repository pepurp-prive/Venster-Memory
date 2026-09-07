#!/usr/bin/env bash
#
# Turn extension/ into an Xcode project you can run.
#
#   ./scripts/build-xcode-project.sh [output-dir]
#
# Everything this does is a wrapper around Apple's own converter; there is no
# build step for the extension itself.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/extension"
OUTPUT="${1:-$ROOT/build}"
APP_NAME="Venster Memory"
BUNDLE_ID="dev.venstermemory.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This needs macOS: Safari extensions are built with Xcode." >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found. Install Xcode from the App Store, then run:" >&2
  echo "  sudo xcode-select --switch /Applications/Xcode.app" >&2
  exit 1
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter not found. It ships with Xcode; check:" >&2
  echo "  xcode-select -p" >&2
  exit 1
fi

echo "Converting $SOURCE -> $OUTPUT"
mkdir -p "$OUTPUT"

xcrun safari-web-extension-converter "$SOURCE" \
  --project-location "$OUTPUT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --swift \
  --copy-resources \
  --no-open \
  --force

cat <<'NEXT'

Done. From here:

  1. open build/Venster Memory/Venster Memory.xcodeproj
  2. Press Run (the app window that appears can be closed straight away).
  3. Safari -> Settings -> Advanced -> tick "Show features for web developers".
  4. Safari -> Develop -> Allow Unsigned Extensions.        (again after each restart of Safari)
  5. Safari -> Settings -> Extensions -> switch on Venster-Memory,
     and set its access to "Allow on Every Website".

  Repeat step 5 in every profile you want it in: Safari gives each profile its
  own copy of the extension, with its own memory, and switches it off by
  default in new profiles.

  Re-running this script after changing extension/ recreates the project. If
  you would rather keep your Xcode project, just press Run again instead --
  --copy-resources means the project holds its own copy of extension/.

NEXT
