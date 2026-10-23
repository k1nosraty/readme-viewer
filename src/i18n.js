/*
 * src/i18n.js — user facing strings.
 *
 * The interface language is English. Everything a user can read lives here so that adding another
 * interface language later is a data change, not a code change: add a dictionary, call
 * `setLocale('xx')`, and the shell re-labels itself. Document content is never translated —
 * Markdown in any language (Persian included) is rendered as-is.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.I18n = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DICT = {
    en: {
      'linkMenu.label': 'Open link',
      'linkMenu.same': 'Open in this tab',
      'linkMenu.new': 'Open in new tab',
      'linkMenu.browser': 'Open in browser',
      'linkMenu.browserUnavailable': 'Local browser previews are available in the desktop app.',
      'reading.title': 'Reading',
      'reading.width': 'Text width',
      'reading.full': 'Full width',
      'reading.comfortable': 'Reading width',
      'reading.spacing': 'Line spacing',
      'reading.normal': 'Normal',
      'reading.relaxed': 'Relaxed',
      'reading.hideDone': 'Hide completed tasks',
      'reading.restore': 'Restore open documents',
      'reading.sessionHint': 'When enabled, document text is saved on this device. Restored copies ask where to save.',
      'reading.clear': 'Clear saved session',
      'reading.bookmarks': 'Bookmarks',
      'reading.bookmark': 'Bookmark section',
      'reading.expand': 'Expand section',
      'reading.collapse': 'Collapse section',
      'reading.storageError': 'Session could not be saved (storage unavailable or session too large). Save your files; session restore has been turned off.',
      'reading.sessionCleared': 'Saved session cleared. Open documents are unchanged.',
      'reading.sessionRestored': 'Session restored as copies. Save each document to choose a file.',
      'compare.toggle': 'Side by side',
      'compare.label': 'Second document',
      'compare.choose': 'Choose second document',
      'compare.activate': 'Activate',
      'compare.close': 'Close second view',
      'compare.resize': 'Resize document views',
      'compare.readOnly': 'Reading view · Activate to edit',
      'compare.needTab': 'Open another document to view side by side.',
      'app.name': 'README Viewer',
      'tabs.label': 'Documents',
      'tabs.new': 'New tab (Ctrl+T)',
      'tabs.close': 'Close tab',
      'tabs.untitled': 'Untitled',
      'heading.anchor': 'Link to this section: {title}',

      'action.open': 'Open',
      'action.save': 'Save',
      'action.saveAs': 'Save as',
      'action.reload': 'Reload from disk',
      'action.back': 'Back (Alt+←)',
      'action.forward': 'Forward (Alt+→)',
      'alert.note': 'Note',
      'alert.tip': 'Tip',
      'alert.important': 'Important',
      'alert.warning': 'Warning',
      'alert.caution': 'Caution',
      'find.placeholder': 'Find in document',
      'footnote.back': 'Back to reference',
      'find.prev': 'Previous match (Shift+Enter)',
      'find.next': 'Next match (Enter)',
      'find.none': 'No matches',
      'recent.title': 'Recent files',
      'info.changedOnDisk': '{name} changed on disk; save or reload to continue',
      'action.export': 'Export as HTML',
      'action.help': 'Help and shortcuts',
      'action.close': 'Close',
      'action.copy': 'Copy code',
      'action.copied': 'Copied',
      'action.cancel': 'Cancel',
      'action.discard': 'Discard',
      'action.openFile': 'Open file…',

      'mode.label': 'View',
      'mode.source': 'Source',
      'mode.split': 'Split',
      'mode.preview': 'Preview',

      'dir.label': 'Text direction',
      'dir.auto': 'Auto',
      'dir.ltr': 'LTR',
      'dir.rtl': 'RTL',
      'dir.auto.hint': 'Detect the direction of each block from its own text',

      'font.decrease': 'Smaller text',
      'font.increase': 'Larger text',
      'font.size': 'Text size',

      'theme.label': 'Theme',
      'theme.system': 'System',
      'theme.light': 'Light',
      'theme.dark': 'Dark',

      'toggle.wrap': 'Wrap long lines',
      'toggle.sync': 'Sync scrolling',
      'toggle.toc': 'Table of contents',
      'toggle.edit': 'Edit in preview',

      'edit.on': 'Interactive editing is on — click a task checkbox to update the Markdown source.',
      'edit.off': 'Read-only preview. Turn on “Edit in preview” to change task checkboxes here.',
      'edit.badge': 'Editing',
      'edit.unavailable': 'Interactive task editing is not available for this document: {reason}',
      'edit.stale': 'The document changed — click the checkbox again.',

      'toc.title': 'Contents',
      'toc.filter': 'Filter headings',
      'toc.empty': 'No matching headings',
      'toc.none': 'No headings in this document',
      'toc.jump': 'Go to line {line}',

      'baseUrl.label': 'Base URL for relative links and images',
      'baseUrl.placeholder': 'https://github.com/user/repo/blob/main/',

      'editor.placeholder': 'Paste Markdown here, or drop a file anywhere in this window.',
      'resizer.hint': 'Drag to resize the panes',
      'toc.anchor': 'Link to this section',

      'pane.source': 'Markdown source',
      'pane.preview': 'Preview',
      'pane.editor': 'Markdown source editor',

      'status.ready': 'Ready',
      'status.file': 'File',
      'status.position': 'Position',
      'status.line': 'Ln {line}, Col {col}',
      'status.count': '{words} words · {chars} characters',
      'status.render': 'Rendered in {ms} ms',
      'status.language': 'Content language',
      'status.encoding': 'Encoding',
      'status.sample': 'Sample document — open or drop a file',
      'status.unsaved': 'Unsaved changes',
      'status.saved': 'All changes saved',
      'status.tasks': '{count} tasks · {done} done',

      'empty.title': 'No document open',
      'empty.body': 'Open a Markdown file, or drop one anywhere in this window.',
      'empty.sample': 'Load sample document',
      'empty.hint': 'Everything is processed locally in your browser. Nothing is uploaded.',

      'drop.hint': 'Drop a Markdown file to open it',

      'unsaved.title': 'Unsaved changes',
      'unsaved.body': '“{name}” has changes that are not saved yet.',
      'unsaved.question': 'Save them before continuing?',

      'info.opened': 'Opened {name}',
      'info.saved': 'Saved {name}',
      'info.exported': 'Exported {name}',
      'info.reloaded': 'Reloaded {name}',
      'info.theme': 'Theme: {mode}',
      'info.syncOn': 'Scroll sync on',
      'info.syncOff': 'Scroll sync off',
      'info.editOn': 'Edit in preview on',
      'info.editOff': 'Edit in preview off',
      'info.noTasks': 'This document has no task checkboxes',

      'error.open': 'Could not open {name}: {reason}',
      'error.save': 'Could not save {name}: {reason}',
      'error.read': 'Could not read {name}',
      'error.binary': '{name} does not look like a text file',
      'error.parse': 'This document could not be rendered: {reason}',
      'error.reload': 'Reload is only available for files opened from disk',
      'error.clipboard': 'Copying is not available in this browser',
      'error.notFound': 'No README file found in that folder',

      'help.title': 'Help and shortcuts',
      'help.items': [
        '<b>Ctrl/⌘+O</b> open a file · <b>Ctrl/⌘+S</b> save · <b>Ctrl/⌘+Shift+S</b> save as',
        '<b>Ctrl/⌘+1 / 2 / 3</b> source, split and preview modes',
        '<b>Ctrl/⌘+E</b> toggle “Edit in preview”',
        '<b>Ctrl/⌘+Shift+F</b> find in document · <b>Alt+← / →</b> back and forward between linked files',
        '<b>Tab</b> indents the selection (never while composing with an IME)',
        'Drag a Markdown file — or a whole folder — onto the window to open it',
        'Every keyboard layout works: the editor is a real text area, so IME composition is untouched',
        'Content direction is decided per block, so Persian, Arabic and Hebrew text inside an English document renders correctly',
        'The Markdown source is the single source of truth: toggling a checkbox rewrites only that <code>[ ]</code> or <code>[x]</code> marker',
        'Files never leave your machine — everything is processed locally'
      ],
      'help.language': 'Interface language',
      'help.close': 'Close',

      'lang.en': 'English',
      'lang.fa': 'فارسی'
    },

    fa: {
      'linkMenu.label': 'بازکردن لینک',
      'linkMenu.same': 'بازکردن در همین تب',
      'linkMenu.new': 'بازکردن در تب جدید',
      'linkMenu.browser': 'بازکردن در مرورگر',
      'linkMenu.browserUnavailable': 'پیش\u200cنمایش فایل محلی در مرورگر در نسخهٔ دسکتاپ در دسترس است.',
      'reading.title': 'مطالعه',
      'reading.width': 'عرض متن',
      'reading.full': 'تمام عرض',
      'reading.comfortable': 'عرض مناسب مطالعه',
      'reading.spacing': 'فاصلهٔ خطوط',
      'reading.normal': 'معمولی',
      'reading.relaxed': 'بیشتر',
      'reading.hideDone': 'پنهان\u200cکردن کارهای انجام\u200cشده',
      'reading.restore': 'بازیابی سندهای باز',
      'reading.sessionHint': 'با فعال\u200cکردن، متن سندها روی همین دستگاه ذخیره می\u200cشود. نسخه\u200cهای بازیابی\u200cشده برای ذخیره مسیر می\u200cپرسند.',
      'reading.clear': 'پاک\u200cکردن نشست ذخیره\u200cشده',
      'reading.bookmarks': 'نشانک\u200cها',
      'reading.bookmark': 'نشانک بخش',
      'reading.expand': 'بازکردن بخش',
      'reading.collapse': 'جمع\u200cکردن بخش',
      'reading.storageError': 'نشست ذخیره نشد؛ فضای ذخیره\u200cسازی در دسترس نیست یا نشست بزرگ است. فایل\u200cها را ذخیره کنید. بازیابی نشست خاموش شد.',
      'reading.sessionCleared': 'نشست ذخیره\u200cشده پاک شد؛ سندهای باز تغییری نکردند.',
      'reading.sessionRestored': 'نشست به\u200cصورت نسخه\u200cهای جدا بازیابی شد. برای هر سند محل ذخیره را انتخاب کنید.',
      'compare.toggle': 'نمایش کنار هم',
      'compare.label': 'سند دوم',
      'compare.choose': 'انتخاب سند دوم',
      'compare.activate': 'فعال\u200cکردن',
      'compare.close': 'بستن نمای دوم',
      'compare.resize': 'تغییر اندازهٔ نمای سندها',
      'compare.readOnly': 'نمای مطالعه · برای ویرایش فعال کنید',
      'compare.needTab': 'برای نمایش کنار هم، سند دیگری باز کنید.',
      'tabs.label': 'سندها',
      'tabs.new': 'تب جدید (Ctrl+T)',
      'tabs.close': 'بستن تب',
      'tabs.untitled': 'بدون نام',
      'app.name': 'نمایشگر README',
      'heading.anchor': 'پیوند به این بخش: {title}',

      'action.open': 'باز کردن',
      'action.save': 'ذخیره',
      'action.saveAs': 'ذخیره به‌نام',
      'action.reload': 'بارگذاری مجدد از دیسک',
      'action.back': 'برگشت (Alt+←)',
      'action.forward': 'جلو (Alt+→)',
      'alert.note': 'نکته',
      'alert.tip': 'راهنمایی',
      'alert.important': 'مهم',
      'alert.warning': 'هشدار',
      'alert.caution': 'احتیاط',
      'find.placeholder': 'جست‌وجو در سند',
      'footnote.back': 'بازگشت به ارجاع',
      'find.prev': 'مورد قبلی (Shift+Enter)',
      'find.next': 'مورد بعدی (Enter)',
      'find.none': 'موردی پیدا نشد',
      'recent.title': 'فایل‌های اخیر',
      'info.changedOnDisk': '{name} روی دیسک تغییر کرد؛ ذخیره یا بارگذاری مجدد کنید',
      'action.export': 'خروجی HTML',
      'action.help': 'راهنما و میان‌برها',
      'action.close': 'بستن',
      'action.copy': 'کپی کد',
      'action.copied': 'کپی شد',
      'action.cancel': 'لغو',
      'action.discard': 'دور انداختن',
      'action.openFile': 'باز کردن فایل…',

      'mode.label': 'نمایش',
      'mode.source': 'نوشتن',
      'mode.split': 'دوتایی',
      'mode.preview': 'پیش‌نمایش',

      'dir.label': 'جهت متن',
      'dir.auto': 'خودکار',
      'dir.ltr': 'چپ‌به‌راست',
      'dir.rtl': 'راست‌به‌چپ',
      'dir.auto.hint': 'جهت هر بلوک از روی متن همان بلوک تشخیص داده می‌شود',

      'font.decrease': 'کوچک‌تر',
      'font.increase': 'بزرگ‌تر',
      'font.size': 'اندازه متن',

      'theme.label': 'پوسته',
      'theme.system': 'خودکار',
      'theme.light': 'روشن',
      'theme.dark': 'تیره',

      'toggle.wrap': 'شکستن خطوط بلند',
      'toggle.sync': 'اسکرول همگام',
      'toggle.toc': 'فهرست مطالب',
      'toggle.edit': 'ویرایش در پیش‌نمایش',

      'edit.on': 'ویرایش تعاملی روشن است — برای تغییر در متن، روی مربع کار کلیک کنید.',
      'edit.off': 'پیش‌نمایش فقط‌خواندنی است. برای تغییر مربع‌های کار «ویرایش در پیش‌نمایش» را روشن کنید.',
      'edit.badge': 'ویرایش',
      'edit.unavailable': 'ویرایش تعاملی کارها برای این سند در دسترس نیست: {reason}',
      'edit.stale': 'سند تغییر کرده است — دوباره روی مربع کلیک کنید.',

      'toc.title': 'فهرست مطالب',
      'toc.filter': 'جستجو در فهرست',
      'toc.empty': 'بدون نتیجه',
      'toc.none': 'این سند عنوانی ندارد',
      'toc.jump': 'رفتن به سطر {line}',

      'baseUrl.label': 'آدرس پایه برای لینک و تصویر نسبی',
      'baseUrl.placeholder': 'https://github.com/user/repo/blob/main/',

      'editor.placeholder': 'متن مارک‌داون را اینجا بنویسید یا فایلی را در پنجره رها کنید.',
      'resizer.hint': 'برای تغییر اندازه بکشید',
      'toc.anchor': 'پیوند به این بخش',

      'pane.source': 'متن مارک‌داون',
      'pane.preview': 'پیش‌نمایش',
      'pane.editor': 'ویرایشگر متن مارک‌داون',

      'status.ready': 'آماده',
      'status.file': 'فایل',
      'status.position': 'موقعیت',
      'status.line': 'سطر {line}، ستون {col}',
      'status.count': '{words} واژه · {chars} نویسه',
      'status.render': 'رندر در {ms} میلی‌ثانیه',
      'status.language': 'زبان محتوا',
      'status.encoding': 'رمزگذاری',
      'status.sample': 'نمونه آماده — فایلی باز کنید یا رها کنید',
      'status.unsaved': 'تغییرات ذخیره نشده',
      'status.saved': 'همه تغییرات ذخیره شد',
      'status.tasks': '{count} کار · {done} انجام شده',

      'empty.title': 'سندی باز نیست',
      'empty.body': 'یک فایل مارک‌داون باز کنید یا آن را در پنجره رها کنید.',
      'empty.sample': 'بارگذاری سند نمونه',
      'empty.hint': 'همه‌چیز به‌صورت محلی در مرورگر پردازش می‌شود؛ چیزی ارسال نمی‌شود.',

      'drop.hint': 'فایل مارک‌داون را اینجا رها کنید',

      'unsaved.title': 'تغییرات ذخیره نشده',
      'unsaved.body': '«{name}» تغییرات ذخیره نشده دارد.',
      'unsaved.question': 'پیش از ادامه ذخیره شود؟',

      'info.opened': 'باز شد: {name}',
      'info.saved': 'ذخیره شد: {name}',
      'info.exported': 'خروجی ساخته شد: {name}',
      'info.reloaded': 'بارگذاری مجدد: {name}',
      'info.theme': 'پوسته: {mode}',
      'info.syncOn': 'اسکرول همگام: روشن',
      'info.syncOff': 'اسکرول همگام: خاموش',
      'info.editOn': 'ویرایش در پیش‌نمایش: روشن',
      'info.editOff': 'ویرایش در پیش‌نمایش: خاموش',
      'info.noTasks': 'این سند مربع کاری ندارد',

      'error.open': 'باز کردن {name} ناموفق بود: {reason}',
      'error.save': 'ذخیره {name} ناموفق بود: {reason}',
      'error.read': 'خواندن {name} ناموفق بود',
      'error.binary': '{name} فایل متنی به نظر نمی‌رسد',
      'error.parse': 'رندر این سند ناموفق بود: {reason}',
      'error.reload': 'بارگذاری مجدد فقط برای فایل‌های باز شده از دیسک ممکن است',
      'error.clipboard': 'کپی کردن در این مرورگر در دسترس نیست',
      'error.notFound': 'فایل README در آن پوشه پیدا نشد',

      'help.title': 'راهنما و میان‌برها',
      'help.items': [
        '<b>Ctrl/⌘+O</b> باز کردن فایل · <b>Ctrl/⌘+S</b> ذخیره · <b>Ctrl/⌘+Shift+S</b> ذخیره به‌نام',
        '<b>Ctrl/⌘+1 / 2 / 3</b> حالت نوشتن، دوتایی و پیش‌نمایش',
        '<b>Ctrl/⌘+E</b> روشن و خاموش کردن «ویرایش در پیش‌نمایش»',
        '<b>Ctrl/⌘+Shift+F</b> جست‌وجو در سند · <b>Alt+← / →</b> برگشت و جلو بین فایل‌های لینک‌شده',
        '<b>Tab</b> تورفتگی (هرگز هنگام ترکیب نویسه‌ها با IME)',
        'کشیدن و رها کردن فایل مارک‌داون یا پوشه روی پنجره',
        'با هر زبان و کیبوردی کار می‌کند: ویرایشگر یک textarea واقعی است',
        'جهت هر بلوک جداگانه تشخیص داده می‌شود؛ متن فارسی در میان متن انگلیسی درست نمایش داده می‌شود',
        'متن مارک‌داون منبع حقیقت است: تغییر هر مربع فقط همان <code>[ ]</code> یا <code>[x]</code> را بازنویسی می‌کند',
        'فایل‌ها به‌صورت محلی پردازش می‌شوند؛ هیچ داده‌ای به اینترنت ارسال نمی‌شود'
      ],
      'help.language': 'زبان رابط کاربری',
      'help.close': 'بستن',

      'lang.en': 'English',
      'lang.fa': 'فارسی'
    }
  };

  var FALLBACK = 'en';
  var locale = FALLBACK;
  var listeners = [];

  function t(key, vars) {
    var table = DICT[locale] || {};
    var value = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    if (value === undefined) value = (DICT[FALLBACK] || {})[key];
    if (value === undefined) return key;
    if (Array.isArray(value)) {
      return vars ? value.map(function (item) { return fill(item, vars); }) : value.slice();
    }
    return fill(value, vars);
  }

  function fill(value, vars) {
    return String(value).replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m;
    });
  }

  function setLocale(next) {
    if (!DICT[next]) return false;
    if (next === locale) return true;
    locale = next;
    for (var i = 0; i < listeners.length; i++) listeners[i](locale);
    return true;
  }

  function getLocale() { return locale; }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function locales() { return Object.keys(DICT); }

  /** Direction the shell should use for a locale. */
  function localeDir(code) {
    return code === 'fa' || code === 'ar' || code === 'he' ? 'rtl' : 'ltr';
  }

  return {
    t: t,
    setLocale: setLocale,
    getLocale: getLocale,
    locales: locales,
    localeDir: localeDir,
    onChange: onChange
  };
}));
