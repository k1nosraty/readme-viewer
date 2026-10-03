# Android Preview

An offline Android WebView shell around the same README Viewer assets. Minimum Android version: 8.0 (API 26). The APK uses a Preview application ID so future production builds can coexist.

## Build

Install JDK 17, Gradle 8.11.1, and Android SDK platform/build-tools 35, then run from the repository root:

```sh
gradle -p android :app:assembleDebug
```

The build copies the current `index.html`, styles, scripts, and vendored dependencies into the APK. Generated assets and build outputs are ignored by Git.

## Files and trust boundary

`MainActivity` serves packaged assets via `WebViewAssetLoader` on its local HTTPS origin. Remote resources and main-frame navigation are blocked in the embedded WebView. External HTTP(S) and mail links are delegated to other apps. File access uses Android's system document picker; JavaScript save requests receive completion/cancellation callbacks. No broad storage or Internet permission is requested.

Save always chooses a document destination; it does not keep a browser File System Access handle. The JavaScript app remains dirty if the native save is cancelled or fails. Rotation retains the WebView; process termination does not recover unsaved drafts.

## Tests

```sh
gradle -p android :app:connectedDebugAndroidTest
```

An emulator test checks offline startup, native bridge availability, Persian task editing and preview geometry. The JavaScript suite also checks native-save cancellation and completion. Physical-device tests for document providers remain necessary.

## Signing

This first installable Preview APK is development-signed. Do not advertise it as a production/Play Store build. A future build may require uninstall/reinstall. Before production publication, provision a permanent private release keystore and secure CI signing secrets; never commit private signing keys to Git.
