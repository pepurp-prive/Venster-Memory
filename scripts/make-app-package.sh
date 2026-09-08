#!/usr/bin/env bash
#
# Build the ready-to-use package:
#
#   dist/Venster-Memory-<version>/
#     Venster Memory.app
#     Installeer Venster-Memory.command
#     LEES MIJ.md
#   dist/Venster-Memory-<version>.zip
#
# Needs macOS with Xcode. Everything is signed ad-hoc: a Safari appex with no
# signature at all will not load, not even with "Allow Unsigned Extensions" on.
#
# Built universal and against macOS 14. Left to itself the runner builds
# arm64-only against whatever SDK it happens to carry, which would refuse to
# run on an Intel Mac or on anything older than the runner image.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Venster Memory"
BUILD_DIR="$ROOT/build"
DIST_DIR="$ROOT/dist"
DERIVED="$BUILD_DIR/DerivedData"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This needs macOS: Safari extensions are built with Xcode." >&2
  exit 1
fi

VERSION="$(python3 -c "import json;print(json.load(open('$ROOT/extension/manifest.json'))['version'])")"
PACKAGE="Venster-Memory-$VERSION"
# The folder inside the zip carries no version number: macOS treats the ".0" in
# "Venster-Memory-1.0" as a file extension and shows it as "Venster-Memory-1",
# which reads like a stray copy.
STAGE_NAME="Venster-Memory"
# A copy of the plain extension, for Develop > "Add Temporary Extension...",
# which wants a folder with manifest.json at its root.
LOOSE_NAME="Extensie-map (tijdelijk laden)"

echo "==> Generating the Xcode project"
rm -rf "$BUILD_DIR" "$DIST_DIR"
"$ROOT/scripts/build-xcode-project.sh" "$BUILD_DIR"

PROJECT="$(find "$BUILD_DIR" -maxdepth 3 -name '*.xcodeproj' -print -quit)"
if [[ -z "$PROJECT" ]]; then
  echo "The converter produced no .xcodeproj under $BUILD_DIR" >&2
  find "$BUILD_DIR" -maxdepth 3 >&2
  exit 1
fi
echo "    project: $PROJECT"

echo "==> Working out the scheme name"
SCHEME="$(xcodebuild -project "$PROJECT" -list -json \
  | python3 -c "import json,sys; s=json.load(sys.stdin)['project']['schemes']; print(next((x for x in s if 'Test' not in x), s[0]))")"
echo "    scheme: $SCHEME"

echo "==> Building Release"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -derivedDataPath "$DERIVED" \
  -destination 'platform=macOS' \
  MACOSX_DEPLOYMENT_TARGET=14.0 \
  ARCHS="arm64 x86_64" \
  ONLY_ACTIVE_ARCH=NO \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$VERSION" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="" \
  PROVISIONING_PROFILE_SPECIFIER="" \
  build

APP="$(find "$DERIVED/Build/Products" -maxdepth 2 -name '*.app' -print -quit)"
if [[ -z "$APP" ]]; then
  echo "No .app came out of the build" >&2
  find "$DERIVED/Build/Products" -maxdepth 3 >&2
  exit 1
fi
echo "    built: $APP"

echo "==> Verifying the signature"
# xcodebuild already signed app and appex ad-hoc ("Sign to Run Locally") with
# the hardened runtime and the generated entitlements. Re-signing here would
# throw those away, so only check the result.
codesign --verify --deep --strict --verbose=2 "$APP"
codesign --display --verbose=2 "$APP" 2>&1 | sed 's/^/    /' 

echo "==> Assembling $PACKAGE"
STAGE="$DIST_DIR/$STAGE_NAME"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/$APP_NAME.app"
ditto "$ROOT/packaging/Installeer Venster-Memory.command" "$STAGE/Installeer Venster-Memory.command"
ditto "$ROOT/packaging/LEES MIJ.md" "$STAGE/LEES MIJ.md"
chmod +x "$STAGE/Installeer Venster-Memory.command"

# Safari's "Add Temporary Extension..." asks for a folder with manifest.json at
# its root. Pointing it at the package folder gets you "Extensie niet
# ondersteund", so ship the plain extension alongside the app.
ditto "$ROOT/extension" "$STAGE/$LOOSE_NAME"
test -f "$STAGE/$LOOSE_NAME/manifest.json"

# ditto, not zip: a plain zip mangles the symlinks inside an .app bundle.
( cd "$DIST_DIR" && ditto -c -k --keepParent "$STAGE_NAME" "$PACKAGE.zip" )

echo
echo "Done: $DIST_DIR/$PACKAGE.zip"
ls -la "$DIST_DIR"
