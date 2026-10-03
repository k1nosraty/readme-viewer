README Viewer v1.0.2 adds Linux packages and the first Android Preview APK.

## Downloads

- **Linux-all.deb**: install on Ubuntu, Debian, Mint and other Debian-based distributions. Launch README Viewer from the applications menu.
- **Linux-Portable.tar.gz**: extract and run `./Launch-README-Viewer.sh` on other desktop Linux distributions. Requires a browser and `xdg-open` (or `sensible-browser`).
- **Android-Preview.apk**: install on Android 8.0 or newer with an updated Android System WebView. Allow installation from the app you use to download/open the APK when Android asks.
- **Windows-Setup.exe**: per-user Windows installer; no Node.js or Python required.
- **Portable.zip**: extract and open `index.html`, or use the Windows launcher.

## Linux installation

```bash
sudo apt install ./README-Viewer-1.0.2-Linux-all.deb
```

The desktop Linux version opens in your default browser. No server or build step is required.

## Android use and Preview limits

The APK contains the viewer and its dependencies and works offline. Open uses Android's document picker. Save and HTML export ask you where to write the file and wait for the write to finish. No broad storage permission is requested. Save creates a copy through the system picker; reload/in-place file handles are browser-only features. Remote images are blocked inside the offline Android app; external links can open in your browser.

**Android is a Preview build**, signed with a development key and distributed directly as an APK, not through Play Store. A future Preview build may require uninstalling this build first because the signing key is not yet a permanent release key. Save your documents outside the app before uninstalling. This build does not include crash recovery for drafts if Android kills the process; save changes before switching away.

## Validation

Publication requires the JavaScript tests, real Chromium smoke checks, Windows install/uninstall checks, Linux package install/remove checks, Android APK signature verification, and an Android emulator smoke test. Native file-picker behavior still needs hands-on testing on physical devices and different document providers.

The Windows installer is unsigned. All downloadable packages include SHA-256 checksums.
