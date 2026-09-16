# Remote Input iOS

The native SwiftUI client is generated with XcodeGen.

```bash
cd ios
xcodegen generate
xcodebuild -project RemoteInput.xcodeproj -scheme RemoteInput -destination 'platform=iOS Simulator,name=iPhone 16 Pro' test
```

`RemoteInput.xcodeproj` is generated output and should not be edited manually.

Run the live protocol acceptance test without storing a password in source control:

```bash
REMOTE_INPUT_PASSWORD='...' swiftc -parse-as-library Scripts/acceptance.swift -o /tmp/remote-input-acceptance
REMOTE_INPUT_PASSWORD='...' /tmp/remote-input-acceptance https://your-server.example.com
```
