# README Viewer 2.0.0

README Viewer now opens source code and configuration files alongside Markdown. The new previews work offline and share the same workspace on Windows and Linux.

## Changes since 1.6.0

- **JSON and INI.** Expand objects, arrays and configuration sections. Select a JSON key or array item to see its path. The app can recognize JSON and INI-style settings in files such as `.conf` and `.cfg`.
- **Code reading.** Use 186 bundled syntax grammars, line numbers, indentation guides and an active-line highlight. Fold blocks in Python, brace-based languages and HTML/XML. Search for phrases across syntax tokens and export highlighted, foldable code to standalone HTML.
- **Direct editing.** Select, insert or delete text in the code preview with undo and redo. Small, unwrapped files retain syntax colors during editing when the text layout can be mirrored accurately.
- **Open, format and save.** Choose a format from the toolbar or File settings with `Ctrl+Shift+L`. A new C++ tab, for example, suggests `Untitled.cpp` on first save. Windows and Linux add README Viewer to **Open with** for supported files and preserve existing defaults.
- **Desktop layout.** Horizontal tabs stay in the top row. Reading and comparison controls move to that row at intermediate widths. The preview skips building source line numbers when the Source pane is hidden.

## Downloads and upgrades

- **Windows.** Per-user NSIS installer for Windows 10/11 with WebView2.
- **Linux.** Debian package and AppImage for compatible WebKitGTK 4.1 systems. Desktop integration exposes the AppImage in the file manager’s **Open with** list.
- **Android Preview.** Development-signed APKs for ARM64 and x86_64.

On desktop, upgrade from 1.6.0 through **Help → Check for updates**. The release includes signed desktop updates and SHA-256 checksums for the installers and APKs.
