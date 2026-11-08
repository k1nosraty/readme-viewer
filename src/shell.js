/* Application menus and toolbar overflow share the existing command controls. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, actions = null, openSub = null;
  var menuButton, nav, toolbar, overflowButton, overflowPanel, toolbarGroups, rankedGroups;
  var toolbarPrefs = { show: true, hidden: [] };
  var toolbarKeys = ['files', 'navigation', 'modes', 'editing', 'direction', 'font', 'appearance', 'theme', 'wrap', 'sync', 'contents', 'export', 'help'];
  function hideSub(focus) {
    if (!openSub) return;
    var trigger = openSub; openSub = null;
    document.getElementById(trigger.getAttribute('data-submenu')).hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function placeSub(trigger, panel) {
    var rect = trigger.getBoundingClientRect(), width = panel.getBoundingClientRect().width;
    var rtl = document.documentElement.dir === 'rtl';
    var x = rtl ? rect.left - width - 4 : rect.right + 4;
    if (x < 8 || x + width > innerWidth - 8) x = rtl ? rect.right + 4 : rect.left - width - 4;
    x = Math.max(8, Math.min(x, innerWidth - width - 8));
    panel.style.left = x + 'px';
    panel.style.top = Math.max(8, Math.min(rect.top, innerHeight - panel.getBoundingClientRect().height - 8)) + 'px';
  }
  function showSub(trigger, focus) {
    hideSub(); openSub = trigger;
    var panel = document.getElementById(trigger.getAttribute('data-submenu'));
    panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    placeSub(trigger, panel);
    if (focus) (panel.querySelector('[aria-checked="true"]') || panel.querySelector('button:not(:disabled), input')).focus();
  }
  function setPopup(trigger, panel, open) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (!open) return;
    var rect = trigger.getBoundingClientRect();
    var top = rect.bottom + 5;
    var width = panel.getBoundingClientRect().width;
    var rtl = document.documentElement.dir === 'rtl';
    var alignRight = panel === overflowPanel ? !rtl : rtl;
    var left = alignRight ? rect.right - width : rect.left;
    panel.style.left = Math.max(8, Math.min(left, innerWidth - width - 8)) + 'px';
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(0, innerHeight - top - 8) + 'px';
  }
  function closeOverflow(focus) {
    if (overflowPanel.hidden) return;
    setPopup(overflowButton, overflowPanel, false);
    if (focus) overflowButton.focus();
  }
  function popupFocusTarget(node) {
    if (nav.contains(node)) return menuButton;
    if (overflowPanel.contains(node)) return overflowButton;
    return node;
  }
  function layoutToolbar() {
    if (toolbar.hidden || !toolbar.clientWidth) return;
    var focus = document.activeElement;
    // Measure every group in its row styling before deciding what fits.
    var next = overflowButton;
    for (var i = toolbarGroups.length - 1; i >= 0; i--) {
      var group = toolbarGroups[i];
      if (group.nextElementSibling !== next) toolbar.insertBefore(group, next);
      next = group;
    }
    var style = getComputedStyle(toolbar), gap = parseFloat(style.columnGap) || 0;
    var available = toolbar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + gap;
    var visible = toolbarGroups.filter(function (item) { return !item.hidden; });
    var widths = new Map(visible.map(function (item) { return [item, item.getBoundingClientRect().width + gap]; }));
    var needed = visible.reduce(function (total, item) { return total + widths.get(item); }, 0);
    overflowButton.hidden = needed <= available;
    if (overflowButton.hidden) closeOverflow();
    else {
      available -= overflowButton.getBoundingClientRect().width + gap;
      var fitting = new Set();
      rankedGroups.forEach(function (item) {
        var width = widths.get(item);
        if (width !== undefined && width <= available) {
          fitting.add(item);
          available -= width;
        }
      });
      visible.forEach(function (item) {
        if (!fitting.has(item)) overflowPanel.appendChild(item);
      });
      if (!overflowPanel.hidden) setPopup(overflowButton, overflowPanel, true);
    }
    if (!toolbar.contains(focus)) return;
    if (overflowPanel.hidden && overflowPanel.contains(focus)) focus = overflowButton;
    if (focus === overflowButton && overflowButton.hidden) {
      focus = toolbar.querySelector('.tgroup:not([hidden]) button:not([hidden]):not(:disabled)') || menuButton;
    }
    if (focus !== document.activeElement) focus.focus({ preventScroll: true });
  }
  var toolbarFrame = 0;
  function scheduleToolbarLayout() {
    if (toolbarFrame) return;
    toolbarFrame = requestAnimationFrame(function () { toolbarFrame = 0; layoutToolbar(); });
  }
  function applyToolbar(save) {
    toolbar.querySelectorAll('[data-toolbar-item]').forEach(function (item) {
      item.hidden = toolbarPrefs.hidden.indexOf(item.getAttribute('data-toolbar-item')) >= 0;
    });
    toolbar.querySelectorAll('[data-toolbar-group]').forEach(function (group) {
      group.hidden = !group.querySelector('[data-toolbar-item]:not([hidden])');
    });
    toolbar.hidden = !toolbarPrefs.show || !toolbarGroups.some(function (group) { return !group.hidden; });
    if (toolbar.hidden) closeOverflow();
    else scheduleToolbarLayout();
    document.querySelector('[data-toolbar-show]').checked = toolbarPrefs.show;
    document.querySelectorAll('[data-toolbar-option]').forEach(function (input) {
      input.checked = toolbarPrefs.hidden.indexOf(input.getAttribute('data-toolbar-option')) < 0;
    });
    if (save) { try { localStorage.setItem('rv.toolbar', JSON.stringify(toolbarPrefs)); } catch (e) { void 0; } }
  }
  function initToolbar() {
    toolbar = document.getElementById('toolbar');
    overflowButton = document.getElementById('btnToolbarMore');
    overflowPanel = document.getElementById('toolbarOverflow');
    toolbarGroups = Array.from(toolbar.querySelectorAll(':scope > .tgroup'));
    rankedGroups = toolbarGroups.slice().sort(function (a, b) {
      return (a.dataset.toolbarPriority || 5) - (b.dataset.toolbarPriority || 5);
    });
    toolbarGroups.forEach(function (group) {
      var heading = document.createElement('span');
      var key = 'toolbar.' + (group.dataset.toolbarGroup || group.dataset.toolbarItem);
      heading.className = 'toolbar-group-label';
      heading.setAttribute('data-i18n', key);
      heading.textContent = RV.I18n.t(key);
      group.prepend(heading);
    });
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
    if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleToolbarLayout).observe(toolbar);
    new MutationObserver(scheduleToolbarLayout).observe(document.documentElement, {
      attributeFilter: ['lang', 'dir', 'style', 'data-density', 'data-windows-titlebar']
    });
    if (document.fonts) document.fonts.addEventListener('loadingdone', scheduleToolbarLayout);
  }
  function menus() { return Array.prototype.slice.call(document.querySelectorAll('.app-menu')); }
  function closeMenus(except) {
    hideSub();
    menus().forEach(function (menu) {
      if (menu !== except) menu.open = false;
    });
  }
  function closeAppMenu(focus) {
    closeMenus();
    setPopup(menuButton, nav, false);
    if (focus) menuButton.focus();
  }
  function close() { closeAppMenu(); closeOverflow(); }
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
    return Array.prototype.slice.call(menu.querySelectorAll('.menu-commands > button:not(:disabled), .menu-commands > .menu-submenu > button'));
  }
  function init(callbacks) {
    if (actions) return;
    actions = callbacks;
    menuButton = document.getElementById('brandMark');
    nav = document.getElementById('appMenuPanel');
    initToolbar();
    function openAppMenu(focus) {
      closeOverflow();
      refresh();
      setPopup(menuButton, nav, true);
      if (focus) nav.querySelector('summary').focus();
    }
    menuButton.addEventListener('click', function (event) {
      if (nav.hidden) openAppMenu(event.detail === 0);
      else closeAppMenu(true);
    });
    menuButton.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault(); openAppMenu(true);
    });
    overflowButton.addEventListener('click', function (event) {
      if (!overflowPanel.hidden) { closeOverflow(true); return; }
      closeAppMenu();
      setPopup(overflowButton, overflowPanel, true);
      if (!event.detail) overflowPanel.querySelector('button:not([hidden]):not(:disabled)')?.focus();
    });
    menus().forEach(function (menu) {
      var summary = menu.querySelector('summary');
      summary.addEventListener('click', function () { closeMenus(menu); refresh(); });
      menu.addEventListener('toggle', function () {
        summary.setAttribute('aria-expanded', menu.open ? 'true' : 'false');
      });
      summary.setAttribute('aria-expanded', 'false');
    });
    nav.addEventListener('scroll', function () {
      if (!openSub) return;
      var anchor = openSub.getBoundingClientRect(), bounds = nav.getBoundingClientRect();
      if (anchor.bottom <= bounds.top || anchor.top >= bounds.bottom) hideSub();
      else placeSub(openSub, document.getElementById(openSub.getAttribute('data-submenu')));
    });
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-submenu')) {
        if (openSub === button) hideSub(); else showSub(button, false);
        return;
      }
      if (button.hasAttribute('data-theme-choice')) {
        actions.setTheme(button.getAttribute('data-theme-choice')); closeAppMenu(true); return;
      }
      if (button.hasAttribute('data-toolbar-reset')) {
        toolbarPrefs = { show: true, hidden: [] }; applyToolbar(true); return;
      }
      var command = button.getAttribute('data-command'), action = button.getAttribute('data-shell-action');
      if (!command && !action && !button.hasAttribute('data-mode-btn') && !button.hasAttribute('data-dir')) return;
      closeAppMenu(true);
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
        closeMenus(next); next.open = wasOpen; next.querySelector('summary').focus();
        return;
      }
      closeMenus(menu); menu.open = true; refresh();
      var buttons = items(menu), current = buttons.indexOf(event.target), target;
      if (event.key === 'Home') target = 0;
      else if (event.key === 'End' || (current < 0 && event.key === 'ArrowUp')) target = buttons.length - 1;
      else target = (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      if (buttons[target]) buttons[target].focus();
    });
    function closeOutside(event) {
      if (!nav.hidden && !nav.contains(event.target) && !menuButton.contains(event.target)) closeAppMenu();
      if (!overflowPanel.contains(event.target) && !overflowButton.contains(event.target)) closeOverflow();
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && openSub) {
        event.preventDefault(); hideSub(true);
      } else if (event.key === 'Escape' && (!nav.hidden || !overflowPanel.hidden)) {
        event.preventDefault(); event.stopPropagation();
        if (!nav.hidden) closeAppMenu(true); else closeOverflow(true);
      } else if (event.key === 'F10' && !event.shiftKey) {
        event.preventDefault(); menuButton.focus();
      }
    });
    window.addEventListener('resize', function () {
      var focus = document.activeElement, trigger = popupFocusTarget(focus);
      close();
      if (trigger !== focus) trigger.focus({ preventScroll: true });
      scheduleToolbarLayout();
      requestAnimationFrame(function () {
        var selected = document.querySelector('#documentTabs .is-active');
        if (selected && selected.scrollIntoView) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
    refresh();
  }
  RV.Shell = { close: close, init: init, refresh: refresh, popupFocusTarget: popupFocusTarget };
}());
