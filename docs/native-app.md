# Native application

Version 1.1.0 uses Tauri 2 for Windows, Linux and Android. The existing HTML application also
runs directly in a browser. Native builds bundle their frontend locally and do not launch a
browser for document editing. External links may open your browser; remote images need network
access.

## Use and limitations

Open a Markdown file with **Open**, make changes, then **Save**. **Save as** chooses another
location. On desktop, Save writes back to the opened file. On Android, the file returned by
Open has read-only access: your first Save asks for a destination and writes a copy, leaving the
source file unchanged. Later saves update that chosen copy. Desktop packages declare `.md`, `.markdown`, `.mdown` and `.mkd` associations; your
system may require choosing README Viewer with **Open with**. Drop a document onto the desktop
window to open it. Save changes before replacing a document or closing the app.

Local relative images resolve inside the opened document's directory. Parent-directory paths
such as `../image.png` are blocked. Android document providers commonly return `content://`
URIs without a directory base, so relative local images are unavailable and the display name
may fall back to `README.md`. Provider permissions and persistence vary; verify important saves
in your file manager. Saves use UTF-8 and preserve an existing UTF-8 BOM and LF/CRLF style;
UTF-16 and legacy input encodings are converted to UTF-8.

Windows requires Windows 10/11 and current WebView2. The unsigned per-user NSIS installer may
trigger Windows publisher warnings. Its WebView2 bootstrapper needs internet if the runtime is
missing. Linux needs compatible WebKitGTK 4.1 runtime libraries; `.deb` installation resolves
package dependencies. AppImage compatibility depends on the distribution and its runtime support.

Android requires Android 8.0+ and an updated System WebView. Allow APK installation from your
downloader when Android asks. This is a development-signed **debug Preview**, outside Play Store.
Future signing changes may require uninstall/reinstall. Save documents outside the app first;
unsaved drafts have no crash recovery if Android terminates the process.

## Build dependencies

Install Node.js (the preview workflow uses Node 22), npm and stable Rust through rustup.
Follow the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.
Windows builds need Microsoft C++ Build Tools with the C++ desktop workload, the MSVC Rust
toolchain and WebView2.

For Ubuntu/Debian:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

For Android, install Android Studio, its SDK platform, platform-tools, build-tools, command-line
tools and side-by-side NDK. Set `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` to your installed
locations. The preview workflow uses JDK 17, Android SDK 36, build-tools 35.0.0 and NDK
27.2.12479018. Add Rust targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## Build commands

From the repository root:

```bash
npm ci
npm run native:dev
```

Build on the corresponding desktop OS:

```bash
# Windows
npm run native:build -- --bundles nsis
# Linux
npm run native:build -- --bundles deb,appimage
```

Desktop bundles appear under `src-tauri/target/release/bundle/`. Tauri automatically runs
`native:prepare` before development and production builds to generate `native-dist/`.

For the Android debug Preview:

```bash
npm run android:init -- --ci
npm run android:configure
npm run android:build -- --ci --debug --apk --target aarch64 x86_64
```

`android:configure` normalizes the generated project's compile and target SDK to stable Android
SDK 36. Run it after initialization, because the current CLI generates SDK 37 settings. These
commands build the debug Preview APK; they are not a production Play Store release setup.

Generated Android outputs are under `src-tauri/gen/android/app/build/outputs/`. The old Java
project under `android/` is retained for historical 1.0.2 builds.

## Validation status

The [native release workflow run](https://github.com/k1nosraty/readme-viewer/actions/runs/37119020194)
passed unit and browser checks, Linux and Windows installed-app open/edit/save/uninstall checks,
and Android APK signature/install/launch checks. Its Android emulator test verifies Persian task-list
editing, full-width Preview, edit preservation through rotation, and the unsaved-changes prompt on
Back. Physical Android devices and document providers, desktop file associations, and additional
Linux distributions still need hands-on review.
