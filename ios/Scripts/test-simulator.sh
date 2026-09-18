#!/bin/bash
set +e

PROJECT_DIR="$HOME/Projects/web-inputer/ios"
DEVICE_ID="${1:-C200C402-4DE2-41C9-8CD4-237A722E4EEB}"
LOG_PATH="/tmp/remote-input-simulator-test.log"
STATUS_PATH="/tmp/remote-input-simulator-test.status"

rm -f "$LOG_PATH" "$STATUS_PATH"
cd "$PROJECT_DIR" || exit 1
xcodebuild \
  -project RemoteInput.xcodeproj \
  -scheme RemoteInput \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath DerivedData \
  test >"$LOG_PATH" 2>&1
status=$?
echo "$status" >"$STATUS_PATH"
exit "$status"
