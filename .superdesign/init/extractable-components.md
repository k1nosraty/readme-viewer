# Extractable Components — readme-viewer

## TopBar
- Source: `index.html:15-58` (`styles.css:65-105`)
- Category: layout
- Description: Fixed 52px app bar: brand mark + file name + unsaved dot, then the full toolbar.
- Extractable props: `fileName` (string), `dirty` (boolean → shows `.dirty-dot`),
  `activeMode` (`write` | `split` | `preview`), `activeDir` (`auto` | `ltr` | `rtl`),
  `theme` (`light` | `dark` | `auto`), `fontSize` (number), `wrap` (boolean),
  `syncScroll` (boolean), `showToc` (boolean)
- Hardcoded: `md` brand mark, all button labels/tooltips (Persian), group order
  (open/save · view mode · direction · font size · toggles · help), all CSS.

## ToolbarButtonGroup
- Source: `index.html:23-56` (`styles.css:107-134`)
- Category: basic
- Description: Hairline-divided cluster of text buttons; pressed state is an accent pill via
  `aria-pressed`.
- Extractable props: `pressedKey` (string, null = none pressed)
- Hardcoded: all button copy, titles, ids, dividers, padding/radius, hover fill.

## PaneHeader
- Source: `index.html:75-78`, `index.html:96-99` (`styles.css:217-229`)
- Category: basic
- Description: 30px strip above each pane: title at the inline start, mono metadata at the end.
- Extractable props: `title` (string), `meta` (string)
- Hardcoded: 12px muted text, `--bg` fill, block-end hairline.

## Sidebar
- Source: `index.html:62-70` (`styles.css:147-196`)
- Category: layout
- Description: 262px TOC rail: heading, scrollable outline, base-URL input pinned at the bottom.
- Extractable props: `open` (boolean), `activeHeadingId` (string, marks `.toc a.active`)
- Hardcoded: «فهرست مطالب» label, «آدرس پایه لینک‌های نسبی» label + placeholder,
  `.h1…h6` indent ladder, accent inline-start marker, background `--bg-subtle`.

## StatusBar
- Source: `index.html:108-118` (`styles.css:383-399`)
- Category: layout
- Description: 26px footer strip: file state, cursor position, word/char counts, render time,
  detected language pushed to the far end.
- Extractable props: `status`, `line`, `column`, `words`, `chars`, `perf`, `lang`
- Hardcoded: `·` separators, `.spacer`, 12px muted styling.

## Modal (HelpDialog)
- Source: `index.html:123-137` (`styles.css:403-437`)
- Category: basic
- Description: Dim-scrim dialog, 560px max, lists shortcuts; closes on button, backdrop or Escape.
- Extractable props: `open` (boolean)
- Hardcoded: help copy, «بستن» button, 10px radius, `rgba(31,35,40,.5)` scrim.
- Caution: the global `[hidden] { display: none !important; }` reset is required.

## Toast
- Source: `index.html:139` (`styles.css:441-456`)
- Category: basic
- Description: Pill notification above the status bar; red variant for errors.
- Extractable props: `message` (string), `kind` (`info` | `error`)
- Hardcoded: placement (fixed, bottom 40px, centered), pill radius, entrance animation.

## MarkdownPreview
- Source: `index.html:100-102` (`styles.css:304-341`)
- Category: basic
- Description: Scrollable GitHub-typography surface, 1012px measure, hover heading anchors.
- Extractable props: `html` (sanitized string), `fontSize` (px number), `direction` (`auto` | `ltr` | `rtl`)
- Hardcoded: 28px/32px padding, 60vh tail padding (for scroll sync accuracy), anchor styling,
  table `max-content` sizing, all `github-markdown.css` typography.