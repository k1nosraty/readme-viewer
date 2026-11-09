# README Viewer 1.6.0

Windows and Linux now share a redesigned desktop workspace. This release adds more ways to navigate open documents and makes reading tools easier to find.

## Changes since 1.5.1

- **Desktop appearance.** Adjust title-bar opacity in View → Appearance on systems that support transparency. The main workspace has one rounded frame, and the two side panels are lightly tinted. Appearance also suggests fonts installed on your system.
- **Document tabs.** Switch between horizontal tabs and a resizable vertical list. Drag to reorder tabs, or use Ctrl+Tab to switch between them. When the horizontal strip fills up, All tabs shows the full document names.
- **Menus and reading.** File, Edit, View and Help stay visible while the current list of commands scrolls. The Edit menu distinguishes document search from filtering the Contents pane. Click Focus or press F8 to start distraction-free reading, and press Esc to return.
- **Responsiveness.** The desktop window appears before draft restoration finishes. Resizing batches window-state requests, and the comparison pane avoids copying unchanged document text on unrelated UI updates. Save also works with non-English keyboard layouts.
- **Build reliability.** Android retries temporary Gradle download failures. Linux can retry AppImage packaging separately from compilation.

## Downloads and upgrades

- **Windows.** Per-user NSIS installer for Windows 10/11 with WebView2.
- **Linux.** Debian package and AppImage for compatible WebKitGTK 4.1 systems.
- **Android Preview.** Separate development-signed APKs for ARM64 and X86_64.

Desktop users on 1.5.1 can upgrade through Help → Check for updates. The release includes signed desktop updates and SHA-256 checksums for the installers and APKs.
