# Shared UI Primitives — readme-viewer

Vanilla HTML/CSS/JS single-file app (no framework, no component library, no Tailwind).
All UI is markup in `index.html` + styles in `styles.css`, wired imperatively in `app.js`.
Design language: GitHub Primer-like neutral surfaces, hairline borders, 6px radius, 14px UI font.

## TopBar (`.topbar`)

- Source: `index.html:15-58`, `styles.css:65-76`
- Description: Fixed-height application bar holding brand/file identity and the whole toolbar.

```html
<header class="topbar">
  <div class="brand">
    <span class="brand-mark">md</span>
    <span class="brand-text" id="fileName">README.md</span>
    <span class="dirty-dot" id="dirtyDot" hidden title="تغییرات ذخیره نشده"></span>
  </div>

  <div class="toolbar" role="toolbar" aria-label="ابزارها">
    <div class="tgroup">
      <button type="button" id="btnOpen" title="باز کردن فایل (Ctrl+O)">باز کردن</button>
      <button type="button" id="btnSave" title="ذخیره (Ctrl+S)">ذخیره</button>
      <button type="button" id="btnSaveAs" title="ذخیره با نام دیگر (Ctrl+Shift+S)">ذخیره به‌نام</button>
    </div>

    <div class="tgroup" role="group" aria-label="حالت نمایش">
      <button type="button" class="seg" data-mode-btn="write" title="فقط ویرایشگر (Ctrl+1)">نوشتن</button>
      <button type="button" class="seg" data-mode-btn="split" title="دو ستون (Ctrl+2)">دوتایی</button>
      <button type="button" class="seg" data-mode-btn="preview" title="فقط پیش‌نمایش (Ctrl+3)">پیش‌نمایش</button>
    </div>

    <div class="tgroup" role="group" aria-label="جهت متن">
      <button type="button" class="seg" data-dir="auto" title="جهت خودکار بر اساس محتوا">خودکار</button>
      <button type="button" class="seg" data-dir="ltr" title="چپ به راست">LTR</button>
      <button type="button" class="seg" data-dir="rtl" title="راست به چپ">RTL</button>
    </div>

    <div class="tgroup" role="group" aria-label="اندازه متن">
      <button type="button" id="btnFontDown" title="کوچک‌تر">A−</button>
      <button type="button" id="btnFontUp" title="بزرگ‌تر">A+</button>
    </div>

    <div class="tgroup">
      <button type="button" id="btnTheme" title="روشن / تیره / خودکار">پوسته</button>
      <button type="button" id="btnWrap" title="شکستن خطوط بلند">شکستن خط</button>
      <button type="button" id="btnSync" title="اسکرول همگام ویرایشگر و پیش‌نمایش">همگام</button>
      <button type="button" id="btnToc" title="نمایش فهرست مطالب" aria-pressed="true">فهرست</button>
      <button type="button" id="btnExport" title="دریافت خروجی HTML مستقل">خروجی HTML</button>
    </div>

    <div class="tgroup">
      <button type="button" id="btnHelp" title="راهنما و میان‌برها">؟</button>
    </div>
  </div>
</header>
```

```css
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--topbar-h);
  padding-inline: 12px;
  background: var(--bg-subtle);
  border-block-end: 1px solid var(--border);
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: thin;
}

.brand { display: flex; align-items: center; gap: 8px; flex: none; }

.brand-mark {
  display: grid;
  place-items: center;
  width: 26px; height: 26px;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font: 600 12px/1 var(--mono);
}

.brand-text {
  max-width: 26ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.dirty-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}

.toolbar { display: flex; align-items: center; gap: 8px; }
```

## ToolbarButtonGroup (`.tgroup`) + button states

- Source: `styles.css:107-134`
- Description: Visual cluster of toolbar buttons separated by hairline dividers. Toggle state is
  expressed only through `aria-pressed="true"` → accent-filled pill.

```css
.tgroup {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-inline-end: 8px;
  border-inline-end: 1px solid var(--border);
  flex: none;
}

.tgroup:last-child { border-inline-end: 0; padding-inline-end: 0; }

.tgroup button {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 5px 9px;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.3;
}

.tgroup button:hover { background: var(--bg-inset); border-color: var(--border); }

.tgroup button[aria-pressed="true"] {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-fg);
}
```

## Pane + PaneHeader (`.pane` / `.pane-head`)

- Source: `index.html:74-103`, `styles.css:210-232`
- Description: A titled, independently scrolling region. Used for the editor and the preview.

```html
<section class="pane pane-editor" id="paneEditor">
  <div class="pane-head">
    <span>ویرایشگر</span>
    <span class="pane-head-meta" id="editorMeta"></span>
  </div>
  <div class="editor-wrap" id="editorWrap">
    <div class="gutter" id="gutter" aria-hidden="true"><div class="gutter-inner" id="gutterInner"></div></div>
    <textarea id="editor" class="editor"
              dir="auto"
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              autocorrect="off"
              aria-label="ویرایشگر متن README"></textarea>
    <div class="drop-hint" id="dropHint">فایل README را اینجا رها کنید</div>
  </div>
</section>

<div class="resizer" id="resizer" role="separator" aria-orientation="vertical" tabindex="0"
     title="برای تغییر عرض بکشید"></div>

<section class="pane pane-preview" id="panePreview">
  <div class="pane-head">
    <span>پیش‌نمایش</span>
    <span class="pane-head-meta" id="previewMeta"></span>
  </div>
  <div class="preview" id="previewScroll" tabindex="0">
    <article class="markdown-body" id="preview" dir="auto"></article>
  </div>
</section>
```

```css
.pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--muted);
  background: var(--bg);
  border-block-end: 1px solid var(--border);
}

.pane-head-meta { font-family: var(--mono); font-size: 11px; }

.resizer { cursor: col-resize; background: var(--border); }
.resizer:hover, .resizer:focus-visible { background: var(--accent); }
```

## Gutter (`.gutter` / `.gutter-inner`)

- Source: `styles.css:245-264`
- Description: Non-interactive line-number rail aligned to editor lines; current line is
  highlighted with `.cur`.

```css
.gutter {
  overflow: hidden;
  background: var(--bg-subtle);
  border-inline-end: 1px solid var(--border);
  user-select: none;
  min-inline-size: 46px;
}

.gutter-inner {
  padding-block: 14px;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  text-align: end;
  color: var(--muted);
  will-change: transform;
}

.gutter-inner span { display: block; padding-inline-end: 10px; }
.gutter-inner .cur { color: var(--accent); font-weight: 600; }
```

## Editor (`.editor`) + DropHint (`.drop-hint`)

- Source: `styles.css:266-300`
- Description: Monospace textarea, `dir="auto"` so every keyboard/IME works natively;
  `white-space: pre` unless `[data-wrap="1"]`.

```css
.editor {
  border: 0;
  resize: none;
  padding: 14px 16px;
  margin: 0;
  min-inline-size: 0;
  background: transparent;
  color: var(--fg);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  tab-size: 4;
  white-space: pre;
  overflow: auto;
  outline: none;
}

.editor[data-wrap="1"] { white-space: pre-wrap; overflow-wrap: anywhere; }
.editor-wrap[data-wrap="1"] .gutter { display: none; }

.drop-hint {
  position: absolute;
  inset: 12px;
  display: none;
  place-items: center;
  border: 2px dashed var(--accent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-weight: 600;
  pointer-events: none;
  z-index: 5;
}

.editor-wrap.dragover .drop-hint { display: grid; }
```

## Preview surface (`.preview` / `.markdown-body` / `.anchor`)

- Source: `styles.css:304-341`
- Description: Scroll container for rendered GitHub-styled markdown. `.markdown-body` is
  1012px max measure; heading anchors fade in on hover at the inline start.

```css
.preview {
  overflow: auto;
  padding: 28px 32px 60vh;
  scroll-behavior: auto;
  background: var(--bg);
}

.markdown-body {
  max-inline-size: 1012px;
  font-size: calc(var(--rv-font) * 1px);
  line-height: 1.5;
  overflow-wrap: break-word;
}

.markdown-body > :first-child { margin-block-start: 0 !important; }
.markdown-body :is(pre, code, kbd, samp) { font-family: var(--mono); }
.markdown-body pre { font-size: var(--code-size); tab-size: 8; }
.markdown-body :not(pre) > code { font-size: var(--code-size); }
.markdown-body img { max-inline-size: 100%; }
.markdown-body table { display: table; inline-size: max-content; max-inline-size: 100%; }
.markdown-body :is(h1, h2, h3, h4, h5, h6) { scroll-margin-block-start: 16px; }

.anchor {
  float: inline-start;
  margin-inline-start: -20px;
  padding-inline-end: 4px;
  color: var(--muted);
  text-decoration: none;
  opacity: 0;
  font-weight: 400;
}

:is(h1, h2, h3, h4, h5, h6):hover > .anchor { opacity: 1; }
.anchor:focus-visible { opacity: 1; }
```

## StatusBar (`.statusbar`)

- Source: `index.html:108-118`, `styles.css:383-399`
- Description: Single-line footer with left-aligned run of facts separated by `·`, pushed last
  item to the inline end with `.spacer`.

```html
<footer class="statusbar">
  <span id="statusFile">آماده</span>
  <span class="sep">·</span>
  <span id="statusPos">سطر ۱، ستون ۱</span>
  <span class="sep">·</span>
  <span id="statusCount">۰ واژه · ۰ نویسه</span>
  <span class="sep">·</span>
  <span id="statusPerf"></span>
  <span class="spacer"></span>
  <span id="statusLang" dir="ltr"></span>
</footer>
```

```css
.statusbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--status-h);
  padding-inline: 12px;
  background: var(--bg-subtle);
  border-block-start: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}

.statusbar .sep { opacity: .5; }
.statusbar .spacer { flex: 1; }
.statusbar b { color: var(--fg); font-weight: 600; }
```

## Modal / HelpDialog (`.modal` / `.modal-box`)

- Source: `index.html:123-137`, `styles.css:403-437`
- Description: Centered dialog over a dim scrim. IMPORTANT: `.modal` sets `display: grid`, so a
  global `[hidden] { display: none !important; }` reset (`styles.css:2`) is required for
  show/hide to work.

```html
<div class="modal" id="helpModal" hidden>
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
    <h2 id="helpTitle">راهنما</h2>
    <ul class="help-list">
      <li><b>Ctrl+O</b> باز کردن فایل · <b>Ctrl+S</b> ذخیره · <b>Ctrl+Shift+S</b> ذخیره به‌نام</li>
      <li><b>Tab</b> فاصله‌گذاری (فقط خارج از حالت ترکیب کاراکتر)</li>
      <li><b>کشیدن و رها کردن</b> فایل README روی پنجره، یا پوشه برای تصاویر نسبی</li>
      <li>برای هر زبان و کیبوردی کار می‌کند: از کیبورد خود مرورگر استفاده می‌شود و ترکیب نویسه‌ها دست‌نخورده می‌ماند.</li>
      <li><b>جهت خودکار</b>: جهت هر پاراگراف جداگانه از روی اولین حرف قوی تشخیص داده می‌شود.</li>
      <li><b>اسکرول همگام</b>: جابه‌جایی در ویرایشگر، پیش‌نمایش را دنبال می‌کند و برعکس.</li>
      <li>فایل‌ها به‌صورت محلی پردازش می‌شوند؛ هیچ داده‌ای به اینترنت ارسال نمی‌شود.</li>
    </ul>
    <button type="button" id="btnHelpClose">بستن</button>
  </div>
</div>
```

```css
.modal {
  position: fixed;
  inset: 0;
  background: rgba(31, 35, 40, .5);
  display: grid;
  place-items: center;
  z-index: 50;
}

.modal-box {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 20px 24px;
  inline-size: min(560px, 92vw);
  max-block-size: 80vh;
  overflow: auto;
}

.modal-box h2 { margin-block: 0 12px; font-size: 17px; }
.help-list { margin: 0 0 16px; padding-inline-start: 20px; line-height: 2; }
.help-list li { font-size: 13px; }
.help-list b { font-family: var(--mono); font-size: 12px; }

.modal-box button {
  padding: 6px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--accent);
  color: var(--accent-fg);
  cursor: pointer;
}
```

## Toast (`.toast`)

- Source: `index.html:139`, `styles.css:441-456`
- Description: Transient pill notification, centered horizontally near the bottom.
  `[data-kind="error"]` turns it red.

```html
<div class="toast" id="toast" hidden aria-live="polite"></div>
```

```css
.toast {
  position: fixed;
  inset-block-end: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--fg);
  color: var(--bg);
  padding: 8px 16px;
  border-radius: 999px;
  box-shadow: var(--shadow);
  z-index: 60;
  font-size: 13px;
  max-inline-size: 80vw;
}

.toast[data-kind="error"] { background: var(--danger); color: #fff; }
```

## Hidden file input

```html
<input type="file" id="fileInput" hidden
       accept=".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain">
```