/* Conventional application menus share the toolbar's existing commands. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, actions = null;
  function menus() { return Array.prototype.slice.call(document.querySelectorAll('.app-menu')); }
  function close(except, focus) {
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
      if (target && target.id === 'btnTheme') {
        button.querySelector('span').textContent = target.title;
      }
    });
    document.querySelector('[data-shell-action="undo"]').disabled = !actions.canUndo();
    document.querySelector('[data-shell-action="redo"]').disabled = !actions.canRedo();
  }
  function items(menu) {
    return Array.prototype.slice.call(menu.querySelectorAll('.menu-panel > button:not(:disabled)'));
  }
  function init(callbacks) {
    if (actions) return;
    actions = callbacks;
    var nav = document.querySelector('.app-menubar');
    menus().forEach(function (menu) {
      var summary = menu.querySelector('summary');
      summary.addEventListener('click', function () { close(menu); refresh(); });
      menu.addEventListener('toggle', function () {
        summary.setAttribute('aria-expanded', menu.open ? 'true' : 'false');
        if (menu.open) refresh();
      });
      summary.setAttribute('aria-expanded', 'false');
    });
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || button.disabled) return;
      var command = button.getAttribute('data-command'), action = button.getAttribute('data-shell-action');
      if (!command && !action && !button.hasAttribute('data-mode-btn') && !button.hasAttribute('data-dir')) return;
      close(null, true);
      if (command) document.getElementById(command).click();
      else if (action && actions[action]) actions[action]();
    });
    nav.addEventListener('keydown', function (event) {
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
      if (event.key === 'Escape' && menus().some(function (menu) { return menu.open; })) {
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
  RV.Shell = { init: init, refresh: refresh };
}());
