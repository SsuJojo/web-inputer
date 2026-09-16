# Remote Input iOS

The native SwiftUI client is generated with XcodeGen.

```bash
cd ios
xcodegen generate
xcodebuild -project RemoteInput.xcodeproj -scheme RemoteInput -destination 'platform=iOS Simulator,name=iPhone 16 Pro' test
```

`RemoteInput.xcodeproj` is generated output and should not be edited manually.

