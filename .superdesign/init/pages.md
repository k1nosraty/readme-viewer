# Pages — readme-viewer

One page only. No routing, no code-splitting, no dynamic imports (the app runs from `file://`,
where ES modules and workers are restricted).

## `/` (the only view)

Entry: `index.html`
Dependencies:
- `index.html` (markup for topbar, sidebar, panes, statusbar, modal, toast, file input)
- `styles.css` (all app chrome styling)
- `app.js` (state, rendering, file I/O, scroll sync, TOC, settings persistence)
- `vendor/github-markdown-light.css` (markdown typography, light)
- `vendor/github-markdown-dark.css` (markdown typography, dark)
- `vendor/hljs-github.min.css` (code token colors, light)
- `vendor/hljs-github-dark.min.css` (code token colors, dark)
- `vendor/marked.umd.js` (GFM parser)
- `vendor/purify.min.js` (HTML sanitizer)
- `vendor/highlight.min.js` (syntax highlighting core)
- `vendor/langs/*.js` (193 highlight grammars, lazily loaded on demand)

### Runtime dependency graph inside `app.js` (IIFE, no modules)

```
app.js (IIFE)
- $ / el.* element lookup            → index.html ids
- state (single object) + localStorage settings
- render()  ──────────────→ marked.parse → DOMPurify.sanitize → hljs.highlightElement
- buildLineMap() / buildToc() / buildAnchors()
- scroll sync: onEditorScroll ⇄ onPreviewScroll (lock + interpolation between block anchors)
- gutter: buildGutter() + markGutterCursor() (transform-based scroll following)
- file I/O: pickOpen/save/saveAs (File System Access API → <input type=file> + download fallback)
- encoding detection: TextDecoder utf-8 / utf-16le / utf-16be / windows-1256 / windows-1252
- drag & drop: file or folder (README search to depth 3)
- shortcuts, theme, font size, wrap, sync toggle, TOC toggle, export standalone HTML
- toast() notifications, beforeunload dirty guard
```

### Sizing note for `--context-file` selection

The full context budget for the only view is small. Preferred payload:
`index.html` + `styles.css` + `.superdesign/init/theme.md` + `.superdesign/init/components.md`.
`app.js` is only needed when the draft must reproduce interactive behavior (scroll sync, IME,
file I/O) — the rest of the context lives in the init files above.