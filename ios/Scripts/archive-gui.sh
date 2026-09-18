#!/bin/bash
set -euo pipefail

PROJECT_DIR="$HOME/Projects/web-inputer/ios"
BUILD_DIR="$PROJECT_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/RemoteInput.xcarchive"
EXPORT_PATH="$BUILD_DIR/export"
TEAM_ID="Y85FPJQ83L"

mkdir -p "$BUILD_DIR"
cd "$PROJECT_DIR"
"$HOME/.local/bin/xcodegen" generate

xcodebuild \
  -project RemoteInput.xcodeproj \
  -scheme RemoteInput \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  archive

cat > "$BUILD_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
</dict>
</plist>
PLIST

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
  -allowProvisioningUpdates

test -f "$EXPORT_PATH/RemoteInput.ipa"
shasum -a 256 "$EXPORT_PATH/RemoteInput.ipa"
