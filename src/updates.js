/* Release checks send no document content. Installation requires a verified desktop signature. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, app, info, candidate = null, checking = null, busy = false, installed = false;
  var panel = 'updates', returnFocus, statusKey = 'updates.ready', statusArgs, lastAttempt = 0, dismissed = '';
  var REPO = 'https://github.com/k1nosraty/readme-viewer', INTERVAL = 12 * 60 * 60 * 1000;
  var automatic = null;
  try { automatic = JSON.parse(localStorage.getItem('rv.updates.auto')); } catch (_) { /* Use the platform default. */ }
  function byId(id) { return document.getElementById(id); }
  function nativeApp() { return RV.Native && RV.Native.available(); }
  function desktop() { return nativeApp() && ['windows', 'linux', 'macos'].indexOf(info.platform) >= 0; }
  function stable(value) { return typeof value === 'string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/.test(value); }
  function newer(value, current) {
    if (!stable(value)) return false;
    var a = value.replace(/^v/, '').split(/[.+]/).slice(0, 3).map(Number);
    var b = current.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(Number);
    if (a.concat(b).some(function (n) { return !Number.isSafeInteger(n); })) return false;
    for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
    return current.indexOf('-') >= 0;
  }
  function status(key, args) { statusKey = key; statusArgs = args; render(); }
  function render() {
    byId('serviceTitle').textContent = RV.I18n.t(panel === 'about' ? 'about.title' : 'updates.title');
    byId('aboutPanel').hidden = panel !== 'about'; byId('updatesPanel').hidden = panel !== 'updates';
    byId('aboutVersion').textContent = info.version;
    byId('updateStatus').textContent = RV.I18n.t(statusKey, statusArgs);
    byId('updateNotes').textContent = candidate ? candidate.notes : '';
    byId('updateVersion').textContent = candidate ? RV.I18n.t('updates.versions', { current: info.version, latest: candidate.version }) : RV.I18n.t('about.version', { version: info.version });
    byId('automaticUpdates').checked = automatic;
    byId('btnUpdateCheck').disabled = busy || !!checking || installed;
    byId('btnUpdateInstall').hidden = !candidate && !installed;
    byId('btnUpdateInstall').disabled = busy || !!checking;
    byId('btnUpdateInstall').textContent = RV.I18n.t(installed ? 'updates.restart' : candidate && candidate.update ? 'updates.install' : 'updates.download');
    byId('btnServiceClose').disabled = busy; byId('btnServiceDone').disabled = busy;
    byId('updateProgress').hidden = !busy;
    byId('updateBanner').hidden = !candidate || dismissed === candidate.version || installed;
    byId('updateBannerText').textContent = candidate ? RV.I18n.t('updates.available', { version: candidate.version }) : '';
  }
  function show(which) {
    if (!app || busy && which !== 'updates') return;
    returnFocus = document.activeElement;
    if (RV.Shell) returnFocus = RV.Shell.popupFocusTarget(returnFocus);
    if (app.state.readingFocus) app.setReadingFocus(false);
    if (RV.Shell) RV.Shell.close();
    panel = which; render(); byId('serviceModal').hidden = false;
    byId('serviceModal').querySelector('.modal-box').scrollTop = 0;
    byId('btnServiceClose').focus({ preventScroll: true });
  }
  function close() {
    if (busy) return;
    byId('serviceModal').hidden = true;
    var target = returnFocus && returnFocus.isConnected && returnFocus.getClientRects().length ? returnFocus : byId('brandMark');
    target.focus();
  }
  function openExternal(url) {
    if (nativeApp()) return RV.Native.openExternal(url);
    window.open(url, '_blank', 'noopener,noreferrer'); return Promise.resolve(true);
  }
  function downloadUrl(release) {
    var assets = Array.isArray(release.assets) ? release.assets : [];
    var pattern = info.platform === 'android' ? (info.arch === 'aarch64' ? /-Android-ARM64-Debug-Preview\.apk$/ : info.arch === 'x86_64' ? /-Android-X86_64-Debug-Preview\.apk$/ : null)
      : info.platform === 'windows' && info.arch === 'x86_64' ? /-setup\.exe$/
      : info.platform === 'linux' && info.arch === 'x86_64' ? /_amd64\.deb$/ : /-Portable\.zip$/;
    var asset = pattern && assets.find(function (item) { return item && pattern.test(item.name); });
    var prefix = REPO + '/releases/download/' + encodeURIComponent(release.tag_name) + '/';
    return asset && typeof asset.browser_download_url === 'string' && asset.browser_download_url.indexOf(prefix) === 0 ? asset.browser_download_url : REPO + '/releases/tag/' + encodeURIComponent(release.tag_name);
  }
  async function publicRelease() {
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch('https://api.github.com/repos/k1nosraty/readme-viewer/releases/latest', { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Release check failed');
      var release = await response.json();
      if (release.draft || release.prerelease || !newer(release.tag_name, info.version)) return null;
      return { version: release.tag_name.replace(/^v/, ''), notes: typeof release.body === 'string' ? release.body.slice(0, 12000) : '', url: downloadUrl(release) };
    } finally { clearTimeout(timer); }
  }
  function check(manual) {
    if (!info || busy || installed) return Promise.resolve(false);
    if (manual) show('updates');
    if (checking) return checking;
    lastAttempt = Date.now(); status('updates.checking');
    checking = (async function () {
      var found;
      if (desktop()) {
        try {
          var update = await RV.Native.checkUpdate();
          if (update && newer(update.version, info.version)) found = { version: update.version, notes: (update.body || '').slice(0, 12000), update: update };
          else if (update) await update.close();
        } catch (_) { /* Unsigned/older releases remain available through the official download page. */ }
      }
      if (!found) found = await publicRelease();
      if (candidate && candidate.update) await candidate.update.close().catch(function () {});
      candidate = found;
      status(found ? 'updates.available' : 'updates.current', found ? { version: found.version } : null);
      return !!found;
    })().catch(function () { status('updates.error'); return false; }).finally(function () { checking = null; render(); });
    render(); return checking;
  }
  async function install() {
    if (busy || checking) return;
    if (installed) { try { await RV.Native.restart(); } catch (_) { status('updates.restartError'); } return; }
    if (!candidate) return;
    if (!candidate.update) {
      try { await openExternal(candidate.url); status('updates.external'); } catch (_) { status('updates.error'); }
      return;
    }
    busy = true; status('updates.downloading');
    var update = candidate.update, progress = byId('updateProgress'), received = 0, total = 0;
    progress.removeAttribute('value');
    try {
      await update.download(function (event) {
        if (event.event === 'Started') total = event.data.contentLength || 0;
        if (event.event === 'Progress') received += event.data.chunkLength;
        if (total > 0) { progress.max = total; progress.value = Math.min(received, total); }
      }, { timeout: 60000 });
      busy = false; close();
      if (!await app.confirmAllDirty()) { show('updates'); status('updates.cancelled'); return; }
      show('updates'); busy = true; status('updates.installing');
      await RV.Reading.saveSession();
      await update.install();
      installed = true; status('updates.installed');
    } catch (_) { status('updates.installError'); }
    finally { busy = false; render(); }
  }
  function maybeCheck() {
    if (automatic && !document.hidden && navigator.onLine !== false && Date.now() - lastAttempt >= INTERVAL) check(false);
  }
  function init(api) {
    if (app) return; app = api;
    info = { version: document.querySelector('meta[name="application-version"]').content, platform: /Android/i.test(navigator.userAgent) ? 'android' : 'browser', arch: '' };
    if (typeof automatic !== 'boolean') automatic = !!nativeApp();
    byId('btnAbout').addEventListener('click', function () { show('about'); });
    byId('btnCheckUpdates').addEventListener('click', function () { check(true); });
    byId('btnUpdateCheck').addEventListener('click', function () { check(true); });
    byId('btnUpdateInstall').addEventListener('click', install);
    ['btnServiceClose', 'btnServiceDone'].forEach(function (id) { byId(id).addEventListener('click', close); });
    byId('serviceModal').addEventListener('mousedown', function (event) { if (event.target === byId('serviceModal')) close(); });
    byId('developerLink').addEventListener('click', function (event) {
      if (nativeApp()) { event.preventDefault(); openExternal(this.href).catch(function () { app.toast(RV.I18n.t('updates.error'), 'error'); }); }
    });
    byId('releaseLink').addEventListener('click', function (event) {
      if (nativeApp()) { event.preventDefault(); openExternal(this.href).catch(function () { status('updates.error'); }); }
    });
    byId('automaticUpdates').addEventListener('change', function () {
      var next = this.checked;
      try { localStorage.setItem('rv.updates.auto', JSON.stringify(next)); automatic = next; if (next) maybeCheck(); }
      catch (_) { this.checked = automatic; app.toast(RV.I18n.t('updates.settingsError'), 'warning'); }
    });
    byId('btnUpdateDetails').addEventListener('click', function () { show('updates'); });
    byId('btnDismissUpdate').addEventListener('click', function () { dismissed = candidate ? candidate.version : ''; render(); });
    document.addEventListener('keydown', function (event) {
      if (byId('serviceModal').hidden || !byId('confirmModal').hidden) return;
      if ((event.ctrlKey || event.metaKey) && ['s', 'o', '1', '2', '3', 'e', 'f'].indexOf(event.key.toLowerCase()) >= 0) event.preventDefault();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        var items = Array.prototype.filter.call(byId('serviceModal').querySelectorAll('button, input, a[href], [tabindex="0"]'), function (node) { return !node.disabled && !node.closest('[hidden]'); });
        var first = items[0], last = items[items.length - 1], active = document.activeElement;
        if (!items.length) event.preventDefault();
        else if (event.shiftKey && (active === first || !byId('serviceModal').contains(active))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (active === last || !byId('serviceModal').contains(active))) { event.preventDefault(); first.focus(); }
      }
      event.stopImmediatePropagation();
    }, true);
    RV.I18n.onChange(render); render();
    document.addEventListener('visibilitychange', maybeCheck); window.addEventListener('online', maybeCheck);
    // No background process: checks run only while the app is open and visible.
    var timer = setInterval(maybeCheck, INTERVAL); window.addEventListener('pagehide', function () { clearInterval(timer); });
    if (nativeApp() && RV.Native.appInfo) RV.Native.appInfo().then(function (value) { info = value; render(); maybeCheck(); }).catch(function () { status('updates.error'); });
    else maybeCheck();
  }
  RV.Updates = { init: init, check: check, show: show, install: install, newer: newer, isOpen: function () { return app && !byId('serviceModal').hidden; } };
}());
