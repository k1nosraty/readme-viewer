/* Bundled for the native shell; browser builds use native.js's no-op adapter. */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';

const root = window;
const available = () => !!root.__TAURI_INTERNALS__;
const abort = () => new DOMException('Save cancelled.', 'AbortError');
const filters = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }];
function fileName(path) {
  let text = path;
  try { text = decodeURIComponent(text); } catch (_) { /* retain literal filename */ }
  if (/^content:/i.test(path)) return 'README.md';
  return text.replace(/\\/g, '/').split('/').pop() || 'README.md';
}
function directory(path) {
  if (/^content:/i.test(path)) return null;
  return path.replace(/\\/g, '/').replace(/\/[^/]*$/, '/');
}
async function handle(path, name, authorize = true) {
  if (authorize && !/^content:/i.test(path)) await invoke('authorize_document_directory', { path });
  const file = { kind: 'file', path, name: name || fileName(path), baseUrl: directory(path) };
  file.getFile = async () => {
    const bytes = await readFile(path);
    return { name: file.name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  file.createWritable = async () => {
    let closed = false;
    return {
      async write(blob) {
        if (closed) throw new Error('File writer is closed.');
        await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      },
      async close() { closed = true; }
    };
  };
  return file;
}
const Native = {
  available,
  async pickOpen() {
    const path = await open({ multiple: false, directory: false, filters });
    return path ? handle(path) : null;
  },
  async pickSave(name) {
    const path = await save({ defaultPath: name, filters });
    return path ? handle(path, /^content:/i.test(path) ? name : undefined, false) : null;
  },
  async openPath(path) {
    if (/^content:/i.test(path)) return handle(path);
    return handle(await invoke('resolve_document_path', { path }));
  },
  async download(payload, name, mime) {
    const target = await Native.pickSave(name);
    if (!target) throw abort();
    const writer = await target.createWritable();
    await writer.write(payload instanceof Blob ? payload : new Blob([payload], { type: mime }));
    await writer.close();
    return true;
  },
  resolveLocalUrl(href, file) {
    if (!file || !file.baseUrl || typeof href !== 'string') return null;
    let value;
    try { value = decodeURIComponent(href.split(/[?#]/)[0]); } catch (_) { return null; }
    if (!value || /[\x00-\x1f]/.test(value) || /^(?:[a-z][a-z\d+.-]*:|[\/\\])/i.test(value)) return null;
    const parts = value.replace(/\\/g, '/').split('/');
    // Keep rendered content within the selected document's directory.
    if (parts.some(part => part === '..')) return null;
    return file.baseUrl + parts.filter(part => part && part !== '.').join('/');
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
    const openPaths = async paths => {
      for (const path of (paths || []).slice(0, 1)) {
        try { if (await hooks.openPath(path) === false) break; } catch (error) { report(error); break; }
      }
    };
    await listen('native-open', event => openPaths(event.payload));
    await window.onDragDropEvent(event => {
      const data = event.payload;
      if (hooks.onDrag) hooks.onDrag(data.type === 'enter' || data.type === 'over');
      if (data.type === 'drop') void openPaths(data.paths);
    });
    let checkingClose = false;
    await window.onCloseRequested(async event => {
      event.preventDefault();
      if (checkingClose) return;
      checkingClose = true;
      try { if (await hooks.confirmClose()) await window.destroy(); }
      catch (error) { report(error); }
      finally { checkingClose = false; }
    });
    await openPaths(await invoke('startup_paths'));
  }
};
root.RV = root.RV || {};
root.RV.Native = Native;
