# README Viewer 1.2.0 — linked documents and lighter reading tools

## What's new

- Follow local desktop document links, including parent-directory Markdown/text files on an explicit click. Directory links find their README; document fragments navigate to the matching heading.
- Browse linked documents with Back/Forward and Alt+Left/Right.
- Search document text, see link destinations, and use accessible Help/Confirm dialogs.
- Open files from the desktop's Open with menu directly in Preview mode.
- Render GitHub alerts and footnotes, including repeated references with individual return links.
- Reopen recent desktop files and reload externally changed files when there are no unsaved edits.

## Fixes and size improvements

- Dropped browser folders resolve local images through blob URLs and open accessible linked documents inside the viewer. Other browser links use a secure new tab, preserving the current document.
- Folder discovery reads every entry batch, selects Markdown README files deterministically, and keeps each document's link base isolated.
- Fix internal heading links, Unicode search offsets, recent-file cancellation and window/status text encoding.
- Share light/dark Markdown rules, trim uncommon syntax grammars and minify native frontend assets without adding heavy runtime dependencies.
- Bound Linux package setup time, avoid a slow package mirror and cache the pinned native WebDriver.

## Downloads

- **Windows:** per-user NSIS `.exe`, Windows 10/11 with current WebView2. Unsigned installer; first installation needs internet if WebView2 must be installed.
- **Linux:** `.deb` and `.AppImage` for compatible systems using WebKitGTK 4.1.
- **Android Preview:** universal development-signed debug APK, Android 8.0+ with updated System WebView, distributed outside Play Store. Signing changes may require uninstall/reinstall; save documents outside the app first.

Desktop Save writes to the opened file. Android's first Save asks for a destination and writes a copy; later saves update that copy. Android content URIs may not provide relative image access or a display name. Local images that traverse parent directories remain blocked. Saves use UTF-8 and retain an existing UTF-8 BOM and LF/CRLF style.

Every download includes a SHA-256 checksum. Publication is gated on unit and real-browser tests, Linux and Windows installed-app open/edit/save/uninstall checks, and Android signature/install/launch and emulator checks for Persian task editing, full-width Preview, rotation and Back-button confirmation. Physical Android providers, desktop file associations and additional Linux distributions still need hands-on review.

Tabs, multiple simultaneous documents and a file-tree sidebar are not included in this version. Earlier releases remain available on the releases page.
