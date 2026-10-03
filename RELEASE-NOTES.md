# README Viewer 1.1.0 — native application preview

The Tauri 2 application opens Markdown in its own window on Windows and Linux. Open, Save,
Save as, reload and HTML export use native file access. Android moves to a Tauri Preview debug
APK using the system document picker. The portable browser application remains supported.

- Windows: per-user NSIS `.exe`; Windows 10/11 with current WebView2. Unsigned installer;
  first installation needs internet if the WebView2 bootstrapper must install the runtime.
- Linux: native `.deb` and `.AppImage`, using WebKitGTK 4.1.
- Android: Android 8.0+ with updated System WebView; development-signed debug Preview,
  distributed outside Play Store. Signing changes may require uninstall/reinstall. Save your
  documents outside the app before uninstalling.
- Desktop Markdown associations and file drag-and-drop; local relative images inside the opened
  document's directory. Parent-directory paths (`../`) are blocked. Android content URIs do not
  provide a relative image base and may show the fallback name `README.md`.
- Saves encode decoded text as UTF-8, retaining a UTF-8 BOM and LF/CRLF style when present.

Native package builds and platform checks are pending validation. Physical-device testing,
Android document-provider behavior and desktop file associations still need hands-on review.
See [native build instructions and limitations](docs/native-app.md).

## Historical 1.0.2 downloads

Existing [GitHub releases](https://github.com/k1nosraty/readme-viewer/releases) remain available:
Windows browser launcher installer, portable ZIP, Linux browser launcher `.deb` and `.tar.gz`,
and the original Java Android Preview APK. The Java Preview's behavior and build instructions
are documented in [android/README.md](android/README.md). These historical packages are distinct
from the 1.1.0 native preview.
