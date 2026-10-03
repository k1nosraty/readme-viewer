# README Viewer

A local, offline Markdown and README viewer with a live preview, a table of contents, synchronized
scrolling, and **interactive task lists**: with *Edit in preview* turned on, you can tick a checkbox
in the rendered document and the Markdown source is updated — one `[ ]` → `[x]` at a time, with
every other byte of the file left exactly as it was.

Version 1.1.0 adds a Tauri 2 native application for Windows and Linux, plus an Android Preview.
Open and Save use native file dialogs and direct file access in the app window. The portable
browser application remains supported and needs no build step. Remote document images and
external links can still use the network.

## Native application (1.1.0)

Native packages are being prepared and validated; this documentation does not certify a released
or tested package. Check [GitHub Releases](https://github.com/k1nosraty/readme-viewer/releases)
for published downloads and their version. Existing 1.0.2 releases remain available.

| Platform | Native package and requirements |
| --- | --- |
| Windows | NSIS `.exe` installer, per user; Windows 10/11 and current Microsoft Edge WebView2. The installer is unsigned. If WebView2 is missing, its bootstrap installer needs internet on first installation. |
| Linux | `.deb` for Ubuntu/Debian with WebKitGTK 4.1, or `.AppImage` for compatible Linux systems. Both open an application window. |
| Android | Tauri Preview debug APK; Android 8.0+ and an updated Android System WebView. Development-signed, distributed outside Play Store. |

No Node.js or Python is needed to use native packages. Click **Open**, choose your Markdown,
turn on **Edit in preview** to change task checkboxes, then click **Save**. Desktop packages
register Markdown file associations; choose README Viewer in your system's **Open with** menu
if needed. You can also drop a file onto the desktop app.

See [native setup, builds and limitations](docs/native-app.md). The Java Android Preview in
[android/README.md](android/README.md) belongs to the historical 1.0.2 release.

## Portable browser application

Download the portable ZIP, **extract the whole archive**, and keep `index.html`, `src/` and
`vendor/` together. Double-click `index.html` or `Launch-README-Viewer.bat` on Windows.
Historical Linux portable archives use `./Launch-README-Viewer.sh` and require a browser and
`xdg-open` (or `sensible-browser`). Historical installers launch the browser application.

```bash
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Or serve the folder and open http://localhost:8080:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Chrome and Edge support saving back to the original file where the File System Access API is
available. Other browsers download an updated copy; replace the original with it if needed.

## Features

- **GitHub-accurate rendering** — headings, tables, task lists, fenced code with syntax
  highlighting, block quotes, images, strikethrough, footnotes-free GFM, hover heading anchors.
- **Three view modes** — Source, Split, Preview (`Ctrl+1/2/3`), with a draggable divider that is
  remembered between sessions.
- **Interactive task lists** — optional, explicit, and safe (see below).
- **Table of contents** — live outline with a filter (`Ctrl+F`) and click-to-jump in both panes.
- **Synchronized scrolling** — proportional, both directions, per block.
- **Direction aware** — every rendered block gets its own `dir`, so a Persian paragraph inside an
  English README is laid out right-to-left while the interface stays LTR. Manual LTR/RTL override
  included.
- **Themes** — Light, Dark and System, applied to the chrome, the rendered Markdown and the
  syntax highlighting.
- **Real file access** — native Open/Save on desktop and Android; in the browser, save back to the same file where the File System Access API exists
  (Chromium), download elsewhere; reload from disk; drag a file *or a whole folder* onto the window
  (a dropped folder is searched for a README and used as the base for relative links).
- **Encoding care** — UTF-8 with or without BOM, UTF-16 LE/BE with or without BOM, legacy
  `windows-1256`/`windows-1252` fallback, CRLF preserved on save, binary files rejected with a
  clear message.
- **Unsaved-changes protection** — a dirty document is never replaced silently, and closing the tab
  warns.
- **Standalone HTML export** — the rendered document as one self-contained file.
- **English interface**, with a complete Persian locale one setting away (`Help → Interface
  language`). Documents in any language render as-is.

## Interactive preview

README Viewer is a viewer first. Interactive editing is opt-in, limited to elements where direct
manipulation makes sense, and it never turns the preview into a WYSIWYG editor.

1. Turn on **Edit in preview** (toolbar, or `Ctrl+E`). The button lights up and the preview pane
   shows an *Editing* badge.
2. Hovering a task checkbox highlights it; clicking toggles it.
3. The Markdown source changes immediately, the document is marked as modified, and focus stays on
   the checkbox you clicked.

### The source is the source of truth

There is no shadow copy of your checklist. Each rendered checkbox carries a `data-rv-task` index
that is matched, on every render, against a map built from the parser's token tree:

```
Markdown source ──lex──▶ tokens ──walk──▶ [{ index, line, start, end, checked, label }]
                                     │
                                     └── index i  ⇄  i-th rendered <input data-rv-task="i">
```

`src/tasks.js` walks the token tree in document order, tracks the source line of every node from
the verbatim `raw` text of the nodes before it, then locates the marker on that line with an
anchored regex and records its character offsets. Toggling replaces those three characters and
nothing else — so two identically-worded tasks never cross-talk:

```markdown
- [ ] Install Qt        ← clicking this one
- [ ] Install Qt        ← leaves this one alone
```

Before a click is accepted, the code re-checks that `source.slice(start, end)` still is a marker;
if the document moved underneath the map, it refreshes and asks you to click again rather than
editing blind. If the token tree and the source ever disagree, interactive editing switches itself
off for that document and says why, instead of risking a wrong edit.

The edit is applied with `textarea.setRangeText()`, preserving the source selection. Browser-native
undo behavior for programmatic edits varies; save important edits before closing the app.

## Architecture

The application shell is `app.js`; everything that can be reasoned about without a DOM lives in
`src/` as dependency-free modules (plain scripts with a UMD footer, so the same files run in the
browser from `file://` and in Node under test).

| File | Responsibility |
| --- | --- |
| `index.html` | markup, icon placeholders, `data-i18n` hooks |
| `styles.css` | design tokens, layout, chrome, Markdown overrides |
| `app.js` | DOM wiring, application state, settings, file I/O, render pipeline |
| `src/tasks.js` | task checkbox ↔ source offset map, and the three-character toggle |
| `src/markdown.js` | marked configuration, renderer overrides, DOMPurify policy |
| `src/encoding.js` | bytes → text (BOM, UTF-16, legacy code pages, line endings) and back |
| `src/direction.js` | per-block and per-document direction, content language detection |
| `src/highlight.js` | syntax highlighting, result cache, lazy language loading |
| `src/export.js` | standalone HTML export |
| `src/i18n.js` | interface strings (`en` default, `fa` included) |
| `src/icons.js` | the SVG icon set |
| `vendor/` | marked, DOMPurify, highlight.js, github-markdown-css — committed on purpose |

Concerns stay separated on purpose: rendering never touches files, file I/O never touches the DOM
tree of the preview, and the interactive bridge (`bindTasks` / `toggleTaskFromPreview` in `app.js`)
is the only place where the two meet.

## Tests

```bash
npm ci          # installs the locked test dependencies (including jsdom)
npm test
```

The JavaScript suite covers:

- `tests/tasks.test.js` — the interactive task-list contract: ordering, duplicates, nesting,
  Persian text, block quotes, ordered lists, code blocks, byte-level preservation, stale maps.
- `tests/markdown.test.js` — renderer output, GitHub classes, anchors, sanitiser policy.
- `tests/encoding.test.js` — BOM/UTF-16/legacy encodings, CRLF round-trip, binary rejection.
- `tests/direction.test.js` — RTL/LTR detection per block and per document.
- `tests/highlight.test.js` — alias resolution, the highlight cache, unknown languages.
- `tests/app.test.js` — the real `index.html` + `app.js` in jsdom: click a checkbox, watch the
  source change, the dirty dot appear, focus return; plus XSS, unsaved-changes, localisation,
  every toolbar control and keyboard shortcut, and a 250-section stress document. These skip
  themselves (with a loud warning) if jsdom is not installed.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ + O` | Open a file |
| `Ctrl/⌘ + S` | Save |
| `Ctrl/⌘ + Shift + S` | Save as |
| `Ctrl/⌘ + 1 / 2 / 3` | Source / Split / Preview |
| `Ctrl/⌘ + E` | Toggle *Edit in preview* |
| `Ctrl/⌘ + F` | Filter the table of contents |
| `Tab` / `Shift + Tab` | Indent / outdent (never during IME composition) |
| `Esc` | Close a dialog, or leave the editor |

## Browser support

Current Chrome, Edge, Firefox and Safari. Saving in place and reloading from disk use the File
System Access API (Chromium); everywhere else the app falls back to downloads. Lazy-loaded
highlighter languages need the app to be reachable over `http(s)` or `file://` (they are plain
`<script>` tags from `vendor/langs/`).

## Vendored dependencies

`marked` (MIT), `DOMPurify` (MPL-2.0/Apache-2.0), `highlight.js` (BSD-3),
`github-markdown-css` (MIT). They are committed in `vendor/` so the app works offline; nothing is
fetched by the application at runtime. Remote document images and links follow normal browser
network behavior. Saving converts decoded text to UTF-8 and preserves UTF-8 BOM and LF/CRLF style.

## Builds and validation

See [native build instructions](docs/native-app.md) for Tauri packages and preview checks.
`python3 scripts/package-release.py` builds the portable browser ZIP and checksum. The historical
release workflow packages the browser launchers and Java Android Preview; native preview builds
use `.github/workflows/native.yml`. Existing releases are never overwritten.
