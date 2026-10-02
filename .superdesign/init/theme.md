# Theme — readme-viewer

## Part 1 — Compact token summary

Two themes, both GitHub Primer derived. Tokens are declared on `[data-theme]` on `<body>`.

### Color tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0d1117` | main surface (editor, preview, pane heads) |
| `--bg-subtle` | `#f6f8fa` | `#161b22` | topbar, statusbar, sidebar, gutter |
| `--bg-inset` | `#eef1f4` | `#010409` | hover fills |
| `--border` | `#d1d9e0` | `#3d444d` | hairlines |
| `--border-strong` | `#b9c2cc` | `#545d68` | emphasis lines |
| `--fg` | `#1f2328` | `#e6edf3` | body text |
| `--muted` | `#59636e` | `#9198a1` | secondary text, labels, gutter numbers |
| `--accent` | `#0969da` | `#4493f8` | active toggles, brand mark, TOC marker, focus ring |
| `--accent-fg` | `#ffffff` | `#0d1117` | text on accent fill |
| `--danger` | `#cf222e` | `#f85149` | error toast |

### Typography

| Token | Value |
| --- | --- |
| `--sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Vazirmatn", "IRANSans", Tahoma, "Noto Sans Arabic", "Noto Sans Naskh Arabic", Arial, sans-serif` |
| `--mono` | `ui-monospace, SFMono-Regular, "Cascadia Mono", "Cascadia Code", Consolas, "DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", Menlo, monospace, "Noto Sans Arabic", "Noto Sans Naskh Arabic", Tahoma, "Segoe UI"` |
| UI base size | `14px` on `body` |
| Editor / gutter | `13px / 1.6`, `tab-size: 4` |
| Pane head / statusbar | `12px`, pane-head-meta `11px` mono |
| Preview body | `calc(var(--rv-font) * 1px)` (default 16), `line-height: 1.5`, `max-inline-size: 1012px` |
| Code inside preview | `var(--code-size)` = `85%` |

Note the font stacks intentionally end in Arabic-capable families so Persian/Arabic/Urdu text
renders from system fonts on Windows, macOS and Linux without webfont downloads.

### Spacing, shape, structure

| Token | Value |
| --- | --- |
| `--radius` | `6px` (modal uses `10px`, toast is a `999px` pill) |
| `--topbar-h` | `52px` |
| `--status-h` | `26px` |
| `--split` | `50%` (editor/preview ratio, resizer is `7px`) |
| sidebar width | `262px` (`inline-size`) |
| `--shadow` | `0 8px 28px rgba(31,35,40,.18)` light / `rgba(1,4,9,.7)` dark |
| `--code-size` | `85%` |

### Breakpoints

- `≤ 780px`: panes stack vertically (1fr / 7px / 1fr), resizer becomes a row resizer, sidebar
  turns into a fixed overlay drawer at the inline end.
- `prefers-reduced-motion: no-preference`: toast entrance animation (`.18s ease-out`).

## Part 2 — Raw source dumps

### `styles.css` — reset + root + themes

```css
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

:root {
  --rv-font: 16;
  --split: 50%;
  --mono: ui-monospace, SFMono-Regular, "Cascadia Mono", "Cascadia Code", Consolas,
          "DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", Menlo, monospace,
          "Noto Sans Arabic", "Noto Sans Naskh Arabic", Tahoma, "Segoe UI";
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans",
          "Vazirmatn", "IRANSans", Tahoma, "Noto Sans Arabic", "Noto Sans Naskh Arabic", Arial, sans-serif;
  --code-size: 85%;
  --radius: 6px;
  --topbar-h: 52px;
  --status-h: 26px;
}

[data-theme="light"] {
  --bg: #ffffff;
  --bg-subtle: #f6f8fa;
  --bg-inset: #eef1f4;
  --border: #d1d9e0;
  --border-strong: #b9c2cc;
  --fg: #1f2328;
  --muted: #59636e;
  --accent: #0969da;
  --accent-fg: #ffffff;
  --danger: #cf222e;
  --shadow: 0 8px 28px rgba(31, 35, 40, .18);
}

[data-theme="dark"] {
  --bg: #0d1117;
  --bg-subtle: #161b22;
  --bg-inset: #010409;
  --border: #3d444d;
  --border-strong: #545d68;
  --fg: #e6edf3;
  --muted: #9198a1;
  --accent: #4493f8;
  --accent-fg: #0d1117;
  --danger: #f85149;
  --shadow: 0 8px 28px rgba(1, 4, 9, .7);
}
```

### `styles.css` — RTL-aware rewrites of the GitHub rules

These overrides are what make GitHub's LTR markdown styles render correctly inside an RTL shell.
They rely on CSS logical properties only.

```css
.markdown-body blockquote {
  border-inline-start: .25em solid var(--border);
  border-inline-end: 0;
  padding-inline-start: 1em;
  padding-inline-end: 0;
}

.markdown-body :is(ul, ol) {
  padding-inline-start: 2em;
  padding-inline-end: 0;
}

.markdown-body :is(ul, ol).contains-task-list {
  padding-inline-start: 0;
  padding-inline-end: 0;
  list-style: none;
}

.markdown-body .task-list-item {
  padding-inline-start: 20px;
  padding-inline-end: 0;
}

.markdown-body .task-list-item input { margin-inline-start: -20px; margin-inline-end: 6px; }

.markdown-body .highlight,
.markdown-body pre {
  padding-inline: 16px;
}

.markdown-body hr { margin-inline: 16px 0; }

.markdown-body table :is(th, td) { padding-inline: 6px; }

.markdown-body .anchor { margin-inline-start: -20px; margin-inline-end: 0; }
```

### Document direction

`<html lang="fa" dir="rtl" data-theme="light">` — the shell is RTL-first; preview content uses
`dir="auto"` per block and `.anchor { float: inline-start }` so heading links sit on the correct
side in mixed-direction documents.