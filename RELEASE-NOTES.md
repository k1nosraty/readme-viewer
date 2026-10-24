# README Viewer 1.3.0 — document workspace and personal appearance

## What's new

- **Document tabs:** open several README files, keep independent edits, selection, scroll position and undo/redo, and identify same-name files by their location. Unsaved documents are protected when tabs or the window close.
- **Two-document view:** read another document alongside the main Source / Split / Preview pane, resize the views, and bring the second document into the main pane for editing. Narrow windows stack the views vertically.
- **Link actions:** open links in the current tab, a new tab or the browser from the context menu. Desktop local-document browser previews use bounded, script-blocked HTML snapshots.
- **Reading tools:** bookmarks, reading-position restoration, section folding, completed-task filtering, comfortable/full/adaptive widths and relaxed line spacing.
- **Contents tree:** expand/collapse branches or all headings, search with ancestor context, and follow the current reading location. Outline folding is independent of document section folding.
- **Familiar application controls:** File / Edit / View / Help menus, explicit theme choices, a compact organized toolbar and persistent toolbar customization. Encoding, EOL and render information are visible in the status bar.
- **View > Appearance:** eight accent presets, a native color picker and HEX input, contrast-adapted light/dark accents, independent document link colors, Neutral / Warm / Cool surfaces and Compact / Comfortable density. Preview changes live, then Apply, Cancel or restore defaults.
- **Optional session restoration:** explicitly opt in to saving open document text locally. Restored documents are detached copies and ask where to save; the app does not silently reacquire file access.

## Fixes and lightweight packaging

- Fix comparison controls disappearing in stacked layouts, distinguish identical tab filenames and keep the active tab visible.
- Preserve late IME input in its original document and keep undo/redo isolated between tabs.
- Restore the original Markdown font stack and the short Split label; preserve full-width Preview.
- Add no production dependencies, fonts or image assets. Appearance customization adds about 5.2 KB to the frontend when gzip-compressed; installer sizes depend on platform packaging.

## Downloads

- **Windows:** per-user NSIS `.exe`, Windows 10/11 with current WebView2. Unsigned installer; first installation needs internet if WebView2 must be installed.
- **Linux:** `.deb` and `.AppImage` for compatible systems using WebKitGTK 4.1.
- **Android Preview:** development-signed debug APK for ARM64/x86_64, Android 8.0+ with updated System WebView, distributed outside Play Store. Signing changes may require uninstall/reinstall; save documents outside the app first.

Desktop Save writes to the opened file. Android's first Save asks for a destination and writes a copy; later saves update that copy. Android content URIs may not provide relative image access or a display name. Local images that traverse parent directories remain blocked. Saves use UTF-8 and retain an existing UTF-8 BOM and LF/CRLF style.

Every download includes a SHA-256 checksum. Publication is gated on unit and real-browser tests, Linux installed-app open/edit/save/uninstall checks, Windows install/window-launch/uninstall checks, and Android signature/install/launch and emulator checks for Persian task editing, full-width Preview, rotation and Back-button confirmation. Physical Android providers, desktop file associations and additional Linux distributions still need hands-on review.


The second pane is read-only until opened in the main pane. A Markdown file-tree sidebar is not included. Appearance changes do not edit the Markdown source. Earlier releases remain available on the releases page.
