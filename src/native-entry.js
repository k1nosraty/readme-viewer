/* Bundled for the native shell; browser builds use native.js's no-op adapter. */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { onBackButtonPress, exit, getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { readFile, writeFile, stat } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';

const root = window;
const available = () => !!root.__TAURI_INTERNALS__;
const abort = () => new DOMException('Save cancelled.', 'AbortError');

async function setupDesktopTitlebar(window, windows, report, onTitlebar) {
  const byId = id => document.getElementById(id);
  const maximize = byId('btnWindowMaximize');
  const syncMaximized = async () => {
    const maximized = await window.isMaximized();
    const key = maximized ? 'window.restore' : 'window.maximize';
    if (maximize.dataset.i18nAria === key) return;
    const label = root.RV.I18n.t(key);
    maximize.dataset.i18nAria = key;
    maximize.dataset.i18nTitle = key;
    maximize.setAttribute('aria-label', label);
    maximize.title = label;
    maximize.innerHTML = root.RV.Icons.svg(maximized ? 'copy' : 'windowMaximize', 15);
  };
  byId('btnWindowMinimize').addEventListener('click', () => window.minimize().catch(report));
  maximize.addEventListener('click', () => window.toggleMaximize().catch(report));
  byId('btnWindowClose').addEventListener('click', () => window.close().catch(report));

  byId('titlebarDrag').hidden = false;
  byId('captionButtons').hidden = false;
  const documentRoot = document.documentElement;
  documentRoot.dataset.desktopTitlebar = '';
  onTitlebar?.();
  let backdropRevision = 0;
  const syncBackdrop = async () => {
    const revision = ++backdropRevision;
    const glass = await invoke('set_window_backdrop', { dark: documentRoot.dataset.theme === 'dark' });
    if (revision !== backdropRevision) return;
    if (glass) documentRoot.dataset.windowGlass = '';
    else delete documentRoot.dataset.windowGlass;
  };
  if (windows) {
    new MutationObserver(() => syncBackdrop().catch(report)).observe(documentRoot, { attributeFilter: ['data-theme'] });
  }
  let resizeTimer;
  await Promise.all([
    syncBackdrop(),
    window.onResized(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => syncMaximized().catch(report), 80);
    }),
    syncMaximized()
  ].map(task => task.catch(report)));
}

function fileName(path) {
  if (/^content:/i.test(path)) {
    try {
      const name = decodeURIComponent(new URL(path).pathname).split(/[/:]/).pop();
      return name && !/^\d+$/.test(name) ? name : 'Document';
    }
    catch (_) { return 'Document'; }
  }
  return path.replace(/\\/g, '/').split('/').pop() || 'README.md';
}
function directory(path) {
  if (/^content:/i.test(path)) return null;
  return path.replace(/\\/g, '/').replace(/\/[^/]*$/, '/');
}
async function handle(path, name, authorize = true, writable = true, grantSavedAssets = true) {
  name = name || fileName(path);
  const localMarkdown = !/^content:/i.test(path) && /\.(?:md|markdown|mdown|mdwn|mkd|txt)$/i.test(name);
  if (authorize && localMarkdown) {
    await invoke('authorize_document_directory', { path });
  }
  const file = { kind: 'file', path, name, baseUrl: directory(path), writable };
  let expectedHash = null;
  file.getFile = async () => {
    const bytes = await readFile(path);
    return { name: file.name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  file.modified = async () => {
    if (/^content:/i.test(path)) return 0;
    const info = await stat(path);
    return info.mtime ? new Date(info.mtime).getTime() : 0;
  };
  file.createWritable = async (options = {}) => {
    // The baseline belongs to the accepted document, not to a later read that may be discarded.
    const revision = options.expectedBytes && !options.overwrite && !/^content:/i.test(path)
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', options.expectedBytes)))
        .map(byte => byte.toString(16).padStart(2, '0')).join('') : expectedHash;
    let closed = false;
    let bytes = null;
    return {
      async write(blob) {
        if (closed) throw new Error('File writer is closed.');
        bytes = new Uint8Array(await blob.arrayBuffer());
      },
      async close() {
        if (closed) throw new Error('File writer is closed.');
        closed = true;
        if (!bytes) return;
        if (/^content:/i.test(path)) {
          // shortcut: document providers cannot rename atomically, desktop paths use staged replacement.
          await writeFile(path, bytes);
        } else {
          try {
            expectedHash = await invoke('write_document_atomic', { path, bytes: Array.from(bytes),
              expectedHash: options.overwrite ? null : revision });
          } catch (error) {
            if (error === 'RV_FILE_CHANGED') {
              const conflict = new Error('The file changed on disk.'); conflict.name = 'FileConflictError'; throw conflict;
            }
            throw error;
          }
        }
        if (!authorize && grantSavedAssets && !/^content:/i.test(path)) {
          try { await invoke('authorize_document_directory', { path }); }
          catch (error) { console.warn('File saved, but local image access could not be enabled.', error); }
        }
      }
    };
  };
  return file;
}
const Native = {
  available,
  installedFontFamilies() { return invoke('installed_font_families'); },
  async appInfo() {
    const [platform, arch] = await invoke('update_platform');
    return { version: await getVersion(), platform, arch };
  },
  checkUpdate() { return check({ timeout: 15000 }); },
  restart() { return invoke('restart_app'); },
  async pickOpen(defaultPath) {
    const path = await open({ multiple: false, directory: false, pickerMode: 'document', defaultPath });
    if (!path) return null;
    const local = !/^content:/i.test(path);
    if (local && !(await stat(path)).isFile) throw new Error('Expected a document file.');
    return handle(path, undefined, true, local);
  },
  async pickSave(name, mime) {
    const saveFilters = mime && /^text\/html(?:;|$)/i.test(mime)
      ? [{ name: 'HTML', extensions: ['html', 'htm'] }]
      : mime && /^image\/svg\+xml(?:;|$)/i.test(mime) ? [{ name: 'SVG image', extensions: ['svg'] }] : undefined;
    const path = await save({ defaultPath: name, filters: saveFilters });
    const markdown = !mime || /^text\/markdown(?:;|$)/i.test(mime);
    return path ? handle(path, /^content:/i.test(path) ? name : undefined, false, true, markdown || !!saveFilters) : null;
  },
  async openPath(path) {
    if (/^content:/i.test(path)) return handle(path, undefined, true, false);
    return handle(await invoke('resolve_document_path', { path }));
  },
  async openRecent(path) {
    try { return await Native.openPath(path); }
    catch (error) {
      if (error !== 'Select a document using Open first') throw error;
      return Native.pickOpen(path);
    }
  },
  async download(payload, name, mime) {
    const target = await Native.pickSave(name, mime);
    if (!target) throw abort();
    const writer = await target.createWritable();
    await writer.write(payload instanceof Blob ? payload : new Blob([payload], { type: mime }));
    await writer.close();
    return true;
  },
  resolveLocalUrl(href, file, allowParent) {
    if (!file || !file.baseUrl || typeof href !== 'string') return null;
    let value;
    try { value = decodeURIComponent(href.split(/[?#]/)[0]); } catch (_) { return null; }
    if (!value || /[\x00-\x1f]/.test(value) || /^(?:[a-z][a-z\d+.-]*:|[\/\\])/i.test(value)) return null;
    const parts = value.replace(/\\/g, '/').split('/');
    // Images stay within the document's directory; clicked links may climb with "..".
    if (!allowParent) {
      if (parts.some(part => part === '..')) return null;
      return file.baseUrl + parts.filter(part => part && part !== '.').join('/');
    }
    const out = file.baseUrl.replace(/\/$/, '').split('/');
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') { if (out.length <= 1) return null; out.pop(); } else out.push(part);
    }
    return out.join('/');
  },
  async openLink(path) {
    return handle(await invoke('open_linked_document', { path }));
  },
  canPreviewInBrowser() {
    return !/Android|iPhone|iPad/i.test((root.navigator && root.navigator.userAgent) || '');
  },
  async previewInBrowser(html) {
    if (!Native.canPreviewInBrowser()) throw new Error('Local browser previews require the desktop app.');
    await invoke('preview_in_browser', { html });
    return true;
  },
  async mountVisualPreview(html, file) {
    const path = file && /\.(?:html?|xhtml)$/i.test(file.name) && !/^content:/i.test(file.path) ? file.path : null;
    const token = await invoke('mount_visual_preview', { html, path });
    return {
      url: convertFileSrc(token, 'rvpreview') + '/_readme_viewer_preview_.html',
      close: () => invoke('unmount_visual_preview', { token }).catch(() => {})
    };
  },
  assetUrl(href, file) {
    const path = Native.resolveLocalUrl(href, file);
    if (!path) return null;
    return convertFileSrc(path);
  },
  async openExternal(href) {
    if (typeof href !== 'string' || !/^(?:https?:\/\/|mailto:)/i.test(href)) return false;
    await openUrl(href);
    return true;
  },
  async initialize(hooks) {
    if (!available()) return;
    const window = getCurrentWindow();
    const report = error => { if (hooks.onError) hooks.onError(error); else console.error(error); };
    const userAgent = root.navigator?.userAgent || '';
    const windows = /Windows NT/i.test(userAgent);
    const android = /Android/i.test(userAgent);
    const desktopTitlebar = windows || (!android && /Linux/i.test(userAgent));
    const openPaths = async paths => {
      for (const path of paths || []) {
        try { if (await hooks.openPath(path) === false) break; } catch (error) { report(error); break; }
      }
    };
    let checkingClose = false;
    const requestClose = async finish => {
      if (checkingClose) return;
      checkingClose = true;
      try { if (await hooks.confirmClose()) await finish(); }
      catch (error) { report(error); }
      finally { checkingClose = false; }
    };
    const listeners = [
      listen('native-open', event => openPaths(event.payload?.slice(0, 1))),
      window.onDragDropEvent(event => {
        const data = event.payload;
        if (hooks.onDrag) hooks.onDrag(data.type === 'enter' || data.type === 'over');
        if (data.type === 'drop') void openPaths(data.paths?.slice(0, 1));
      }),
      window.onCloseRequested(event => {
        event.preventDefault();
        return requestClose(() => window.destroy());
      })
    ];
    if (desktopTitlebar) {
      listeners.push(setupDesktopTitlebar(window, windows, report, hooks.onTitlebar));
    }
    if (android) {
      // Registering takes over Android's default Back navigation and exit.
      listeners.push(onBackButtonPress(() => requestClose(() => exit(0))));
    }
    await Promise.all(listeners.map(task => task.catch(report)));
    if (desktopTitlebar) await window.show().catch(report);
    await openPaths(await invoke('startup_paths'));
  }
};
root.RV = root.RV || {};
root.RV.Native = Native;
