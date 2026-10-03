# README Viewer

A local, offline Markdown and README viewer with a live preview, a table of contents, synchronized
scrolling, and **interactive task lists**: with *Edit in preview* turned on, you can tick a checkbox
in the rendered document and the Markdown source is updated — one `[ ]` → `[x]` at a time, with
every other byte of the file left exactly as it was.

No build step or server is needed. The application works offline in your browser.
Remote images and external links in a document can still use the network.

## Install on Windows

Download the installer from [GitHub Releases](https://github.com/k1nosraty/readme-viewer/releases/latest)
and run it. It installs for your Windows account without administrator privileges and adds a Start
menu shortcut. No Node.js or Python installation is needed.

For portable use, download the ZIP, **extract the whole archive**, and double-click
`Launch-README-Viewer.bat`. Keep `index.html`, `src/`, and `vendor/` together.

Click **Open**, choose your README, and use **Edit in preview** to toggle task checkboxes.
Click **Save** afterwards. If your browser cannot save back to the original file, it downloads an
updated copy; replace the original with that copy if needed. Chrome and Edge are recommended.

The installer is unsigned; Windows may ask you to confirm the publisher. You can uninstall it
from Windows Settings → Apps.

```
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Or serve the folder and browse to it:

```bash
python3 -m http.server 8080 --bind 0.0.0.0    # then open http://localhost:8080
```

## Install on Linux

Download the `.deb` from Releases on Ubuntu/Debian/Mint and install it:

```bash
sudo apt install ./README-Viewer-1.0.2-Linux-all.deb
```

Then open **README Viewer** from your applications menu. Other desktop Linux distributions can
extract the Linux portable `.tar.gz` and run `./Launch-README-Viewer.sh`. A web browser and
`xdg-open` (or `sensible-browser`) are required; no Node.js/Python/server is needed to use it.

## Install on Android

Download **Android-Preview.apk** from Releases and allow installation from your downloader when
Android asks. Requires Android 8.0 or newer with an updated Android System WebView. Open and Save use the system document picker; HTML
export also writes through that picker. The APK is offline and blocks remote images.

This first Android build is **Preview**, development-signed, and not a Play Store release.
Future builds may require uninstall/reinstall until permanent release signing is configured.
Save documents outside the app before uninstalling; unsaved drafts do not survive process
termination. See [Android build and limitations](android/README.md).

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
- **Real file access** — save back to the same file where the File System Access API exists
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

84 tests, no build step:

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

## Release builds

`python3 scripts/package-release.py` validates runtime assets and builds the portable ZIP with a
SHA-256 checksum. The GitHub Actions release workflow runs the complete test suite, builds the
Windows installer with Inno Setup, checks installation and uninstallation, then publishes the
version in `package.json`. Existing releases are never overwritten.
