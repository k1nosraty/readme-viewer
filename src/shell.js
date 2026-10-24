/* Conventional application menus share the toolbar's existing commands. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, actions = null, openSub = null;
  var toolbarPrefs = { show: true, hidden: [] };
  var toolbarKeys = ['files', 'navigation', 'modes', 'editing', 'direction', 'font', 'theme', 'wrap', 'sync', 'contents', 'export', 'help'];
  function hideSub(focus) {
    if (!openSub) return;
    var trigger = openSub; openSub = null;
    document.getElementById(trigger.getAttribute('data-submenu')).hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function showSub(trigger, focus) {
    hideSub(); openSub = trigger;
    var panel = document.getElementById(trigger.getAttribute('data-submenu'));
    panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    var rect = trigger.getBoundingClientRect(), width = panel.getBoundingClientRect().width;
    var rtl = document.documentElement.dir === 'rtl';
    var x = rtl ? rect.left - width - 4 : rect.right + 4;
    if (x < 8 || x + width > innerWidth - 8) x = rtl ? rect.right + 4 : rect.left - width - 4;
    x = Math.max(8, Math.min(x, innerWidth - width - 8));
    panel.style.left = x + 'px';
    panel.style.top = Math.max(8, Math.min(rect.top, innerHeight - panel.getBoundingClientRect().height - 8)) + 'px';
    if (focus) (panel.querySelector('[aria-checked="true"]') || panel.querySelector('button:not(:disabled), input')).focus();
  }
  function applyToolbar(save) {
    var toolbar = document.getElementById('toolbar');
    toolbar.querySelectorAll('[data-toolbar-item]').forEach(function (item) {
      item.hidden = toolbarPrefs.hidden.indexOf(item.getAttribute('data-toolbar-item')) >= 0;
    });
    toolbar.querySelectorAll('[data-toolbar-group]').forEach(function (group) {
      group.hidden = !Array.prototype.some.call(group.children, function (child) { return !child.hidden; });
    });
    toolbar.hidden = !toolbarPrefs.show || !Array.prototype.some.call(toolbar.children, function (child) { return !child.hidden; });
    document.querySelector('[data-toolbar-show]').checked = toolbarPrefs.show;
    document.querySelectorAll('[data-toolbar-option]').forEach(function (input) {
      input.checked = toolbarPrefs.hidden.indexOf(input.getAttribute('data-toolbar-option')) < 0;
    });
    if (save) { try { localStorage.setItem('rv.toolbar', JSON.stringify(toolbarPrefs)); } catch (e) { void 0; } }
  }
  function initToolbar() {
    try {
      var saved = JSON.parse(localStorage.getItem('rv.toolbar'));
      if (saved && typeof saved === 'object') {
        toolbarPrefs.show = saved.show !== false;
        toolbarPrefs.hidden = Array.isArray(saved.hidden) ? saved.hidden.filter(function (key) { return toolbarKeys.indexOf(key) >= 0; }) : [];
      }
    } catch (e) { void 0; }
    var choices = document.getElementById('toolbarChoices');
    toolbarKeys.forEach(function (key) {
      var label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
      input.type = 'checkbox'; input.setAttribute('data-toolbar-option', key);
      text.setAttribute('data-i18n', 'toolbar.' + key); text.textContent = RV.I18n.t('toolbar.' + key);
      label.appendChild(input); label.appendChild(text); choices.appendChild(label);
    });
    applyToolbar(false);
  }
  function menus() { return Array.prototype.slice.call(document.querySelectorAll('.app-menu')); }
  function close(except, focus) {
    hideSub();
    menus().forEach(function (menu) {
      if (menu !== except && menu.open) {
        menu.open = false;
        if (focus) menu.querySelector('summary').focus();
      }
    });
  }
  function refresh() {
    if (!actions) return;
    document.querySelectorAll('[data-command]').forEach(function (button) {
      var target = document.getElementById(button.getAttribute('data-command'));
      button.disabled = !target || target.disabled;
      var pressed = target && target.getAttribute('aria-pressed');
      if (pressed !== null && pressed !== undefined) button.setAttribute('aria-pressed', pressed);
      else button.removeAttribute('aria-pressed');
    });
    document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
      button.setAttribute('aria-checked', button.getAttribute('data-theme-choice') === actions.getTheme() ? 'true' : 'false');
    });
    document.querySelector('[data-shell-action="undo"]').disabled = !actions.canUndo();
    document.querySelector('[data-shell-action="redo"]').disabled = !actions.canRedo();
  }
  function items(menu) {
    return Array.prototype.slice.call(menu.querySelectorAll('.menu-panel > button:not(:disabled), .menu-panel > .menu-submenu > button'));
  }
  function init(callbacks) {
    if (actions) return;
    actions = callbacks;
    initToolbar();
    var nav = document.querySelector('.app-menubar');
    menus().forEach(function (menu) {
      var summary = menu.querySelector('summary');
      summary.addEventListener('click', function () { close(menu); refresh(); });
      menu.addEventListener('toggle', function () {
        summary.setAttribute('aria-expanded', menu.open ? 'true' : 'false');
        if (menu.open) refresh();
      });
      menu.querySelector('.menu-panel').addEventListener('scroll', function () { hideSub(); });
      summary.setAttribute('aria-expanded', 'false');
    });
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-submenu')) {
        if (openSub === button) hideSub(); else showSub(button, false);
        return;
      }
      if (button.hasAttribute('data-theme-choice')) {
        actions.setTheme(button.getAttribute('data-theme-choice')); close(null, true); return;
      }
      if (button.hasAttribute('data-toolbar-reset')) {
        toolbarPrefs = { show: true, hidden: [] }; applyToolbar(true); return;
      }
      var command = button.getAttribute('data-command'), action = button.getAttribute('data-shell-action');
      if (!command && !action && !button.hasAttribute('data-mode-btn') && !button.hasAttribute('data-dir')) return;
      close(null, true);
      if (command) document.getElementById(command).click();
      else if (action && actions[action]) actions[action]();
    });
    nav.addEventListener('change', function (event) {
      var input = event.target;
      if (input.hasAttribute('data-toolbar-show')) toolbarPrefs.show = input.checked;
      else if (input.hasAttribute('data-toolbar-option')) {
        var key = input.getAttribute('data-toolbar-option');
        toolbarPrefs.hidden = toolbarPrefs.hidden.filter(function (value) { return value !== key; });
        if (!input.checked) toolbarPrefs.hidden.push(key);
      } else return;
      applyToolbar(true);
    });
    nav.addEventListener('keydown', function (event) {
      var rtl = document.documentElement.dir === 'rtl';
      var outward = rtl ? 'ArrowLeft' : 'ArrowRight', inward = rtl ? 'ArrowRight' : 'ArrowLeft';
      if (openSub && (event.key === 'Escape' || (event.target.closest('.submenu-panel') && event.key === inward))) {
        event.preventDefault(); event.stopPropagation(); hideSub(true); return;
      }
      if (event.target.hasAttribute('data-submenu') && (event.key === outward || event.key === 'ArrowDown')) {
        event.preventDefault(); event.stopPropagation(); showSub(event.target, true); return;
      }
      var subPanel = event.target.closest('.submenu-panel');
      if (subPanel) {
        if (event.target.tagName === 'BUTTON' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) >= 0) {
          event.preventDefault();
          var subItems = Array.prototype.slice.call(subPanel.querySelectorAll('button:not(:disabled)'));
          var subIndex = subItems.indexOf(event.target);
          var nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? subItems.length - 1 : (subIndex + (event.key === 'ArrowUp' ? -1 : 1) + subItems.length) % subItems.length;
          if (subItems[nextIndex]) subItems[nextIndex].focus();
        }
        return;
      }
      var menu = event.target.closest('.app-menu');
      if (!menu || !/^(BUTTON|SUMMARY)$/.test(event.target.tagName)) return;
      var keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (keys.indexOf(event.key) < 0) return;
      var summary = menu.querySelector('summary');
      if (event.target.tagName === 'SUMMARY' && event.target !== summary) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        var all = menus(), index = all.indexOf(menu);
        var step = (event.key === 'ArrowRight' ? 1 : -1) * (document.documentElement.dir === 'rtl' ? -1 : 1);
        var next = all[(index + step + all.length) % all.length], wasOpen = menu.open;
        close(next); next.open = wasOpen; next.querySelector('summary').focus();
        return;
      }
      menu.open = true; refresh();
      var buttons = items(menu), current = buttons.indexOf(event.target), target;
      if (event.key === 'Home') target = 0;
      else if (event.key === 'End' || (current < 0 && event.key === 'ArrowUp')) target = buttons.length - 1;
      else target = (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      if (buttons[target]) buttons[target].focus();
    });
    document.addEventListener('pointerdown', function (event) {
      if (!nav.contains(event.target)) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && openSub) {
        event.preventDefault(); hideSub(true);
      } else if (event.key === 'Escape' && menus().some(function (menu) { return menu.open; })) {
        event.preventDefault(); event.stopPropagation(); close(null, true);
      } else if (event.key === 'F10' && !event.shiftKey) {
        event.preventDefault(); nav.querySelector('summary').focus();
      }
    });
    window.addEventListener('resize', function () {
      close();
      requestAnimationFrame(function () {
        var selected = document.querySelector('#documentTabs [aria-selected="true"]');
        if (selected && selected.scrollIntoView) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
    refresh();
  }
  RV.Shell = { close: close, init: init, refresh: refresh };
}());
