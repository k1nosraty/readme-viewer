/* Application menus and toolbar overflow share the existing command controls. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, actions = null, openSub = null;
  var menuButton, nav, toolbar, tocButton, overflowButton, overflowPanel, toolbarGroups, rankedGroups;
  var allTabsButton, allTabsPanel, menuCategories;
  var toolbarPrefs = { show: true, hidden: [] };
  var toolbarKeys = ['files', 'navigation', 'modes', 'editing', 'previewFormat', 'direction', 'font', 'appearance', 'theme', 'wrap', 'sync', 'export', 'help'];
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
    if (trigger.getAttribute('aria-controls') === panel.id) trigger.setAttribute('aria-expanded', String(open));
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
  function closeAllTabs(focus) {
    if (allTabsPanel.hidden) return;
    setPopup(allTabsButton, allTabsPanel, false);
    if (focus) allTabsButton.focus();
  }
  function fitTabs(bar) {
    if (!allTabsButton) return;
    var inTitlebar = bar.parentElement.id === 'titlebarTabs' && bar.clientWidth > 0;
    var reclaimed = 0;
    if (inTitlebar && !allTabsButton.hidden) {
      var gap = parseFloat(getComputedStyle(bar.parentElement).columnGap) || 0;
      reclaimed = allTabsButton.offsetWidth + gap;
    }
    var show = inTitlebar && bar.scrollWidth > bar.clientWidth + reclaimed + 1;
    if (allTabsButton.hidden === !show) return;
    if (!show) {
      var focus = document.activeElement;
      closeAllTabs();
      if (focus === allTabsButton || allTabsPanel.contains(focus)) {
        var active = bar.querySelector('[aria-selected="true"]');
        if (active) active.focus({ preventScroll: true });
      }
    }
    allTabsButton.hidden = !show;
  }
  function popupFocusTarget(node) {
    if (nav.contains(node)) return menuButton;
    if (overflowPanel.contains(node)) return overflowButton;
    if (allTabsPanel.contains(node)) return allTabsButton;
    return node;
  }
  function layoutToolbar() {
    var focus = document.activeElement;
    // Measure every group in its row styling before deciding what fits.
    var next = overflowButton;
    for (var i = toolbarGroups.length - 1; i >= 0; i--) {
      var group = toolbarGroups[i];
      if (group.nextElementSibling !== next) toolbar.insertBefore(group, next);
      next = group;
    }
    if (!toolbar.hidden && toolbar.clientWidth) fitToolbar();
    if (!toolbar.contains(focus)) return;
    if (overflowPanel.hidden && overflowPanel.contains(focus)) focus = overflowButton;
    if (focus.closest('[hidden]')) focus = toolbar.hidden ? menuButton : tocButton;
    if (focus !== document.activeElement) focus.focus({ preventScroll: true });
  }
  function fitToolbar() {
    var style = getComputedStyle(toolbar), gap = parseFloat(style.columnGap) || 0;
    var available = toolbar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - tocButton.getBoundingClientRect().width;
    var visible = toolbarGroups.filter(function (item) { return !item.hidden && item.parentElement === toolbar; });
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
  }
  var toolbarFrame = 0;
  function scheduleToolbarLayout() {
    if (toolbarFrame) return;
    toolbarFrame = requestAnimationFrame(function () { toolbarFrame = 0; layoutToolbar(); });
  }
  function applyToolbar(save) {
    document.querySelectorAll('[data-toolbar-item]').forEach(function (item) {
      item.hidden = toolbarPrefs.hidden.indexOf(item.getAttribute('data-toolbar-item')) >= 0;
    });
    toolbar.querySelectorAll('[data-toolbar-group]').forEach(function (group) {
      group.hidden = !group.querySelector('[data-toolbar-item]:not([hidden])');
    });
    toolbar.hidden = !toolbarPrefs.show;
    if (toolbar.hidden) closeOverflow();
    scheduleToolbarLayout();
    document.querySelector('[data-toolbar-show]').checked = toolbarPrefs.show;
    document.querySelectorAll('[data-toolbar-option]').forEach(function (input) {
      input.checked = toolbarPrefs.hidden.indexOf(input.getAttribute('data-toolbar-option')) < 0;
    });
    if (save) { try { localStorage.setItem('rv.toolbar', JSON.stringify(toolbarPrefs)); } catch (e) { void 0; } }
  }
  function initToolbar() {
    toolbar = document.getElementById('toolbar');
    tocButton = document.getElementById('btnToc');
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
      attributeFilter: ['lang', 'dir', 'style', 'data-density']
    });
    if (document.fonts) document.fonts.addEventListener('loadingdone', scheduleToolbarLayout);
  }
  function selectMenu(category) {
    hideSub();
    menuCategories.forEach(function (button) {
      var selected = button === category;
      button.setAttribute('aria-pressed', String(selected));
      document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
    });
  }
  function closeAppMenu(focus) {
    selectMenu();
    setPopup(menuButton, nav, false);
    if (focus) menuButton.focus();
  }
  function close(keepOverflow) { closeAppMenu(); if (!keepOverflow) closeOverflow(); closeAllTabs(); }
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
    var canUndo = actions.canUndo();
    document.querySelectorAll('[data-shell-action="undo"]').forEach(function (button) { button.disabled = !canUndo; });
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
    menuCategories = Array.from(nav.querySelectorAll('.app-menu-categories button'));
    allTabsButton = document.getElementById('btnAllTabs');
    allTabsPanel = document.getElementById('allTabsPanel');
    allTabsButton.addEventListener('click', function () {
      if (!allTabsPanel.hidden) { closeAllTabs(true); return; }
      close();
      allTabsPanel.replaceChildren();
      document.querySelectorAll('#titlebarTabs [role="tab"]').forEach(function (tab) {
        var choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'menu-command';
        choice.textContent = tab.textContent;
        choice.title = tab.title;
        choice.setAttribute('aria-pressed', tab.getAttribute('aria-selected'));
        choice.addEventListener('click', function () {
          closeAllTabs(true);
          tab.click();
        });
        allTabsPanel.appendChild(choice);
      });
      setPopup(allTabsButton, allTabsPanel, true);
      var selected = allTabsPanel.querySelector('[aria-pressed="true"]');
      if (selected) selected.focus();
    });
    initToolbar();
    document.getElementById('btnToolbarUndo').addEventListener('click', actions.undo);
    function openAppMenu(focus) {
      closeOverflow();
      refresh();
      selectMenu(menuCategories[0]);
      setPopup(menuButton, nav, true);
      if (focus) menuCategories[0].focus();
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
    nav.addEventListener('scroll', function (event) {
      if (!openSub || event.target !== openSub.closest('.app-menu')) return;
      var anchor = openSub.getBoundingClientRect(), bounds = event.target.getBoundingClientRect();
      if (anchor.bottom <= bounds.top || anchor.top >= bounds.bottom) hideSub();
      else placeSub(openSub, document.getElementById(openSub.getAttribute('data-submenu')));
    }, true);
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (menuCategories.includes(button)) { selectMenu(button); return; }
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
      var category = event.target.closest('.app-menu-categories button');
      var menu = event.target.closest('.app-menu') || (category && document.getElementById(category.getAttribute('aria-controls')));
      if (!menu || event.target.tagName !== 'BUTTON') return;
      var keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (keys.indexOf(event.key) < 0) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        var currentCategory = category || nav.querySelector('.app-menu-categories [aria-pressed="true"]');
        var index = menuCategories.indexOf(currentCategory);
        var step = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
        var next = menuCategories[(index + step + menuCategories.length) % menuCategories.length];
        selectMenu(next); next.focus();
        return;
      }
      if (category) selectMenu(category);
      var buttons = items(menu), current = buttons.indexOf(event.target), target;
      if (event.key === 'Home') target = 0;
      else if (event.key === 'End' || (current < 0 && event.key === 'ArrowUp')) target = buttons.length - 1;
      else target = (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      if (buttons[target]) buttons[target].focus();
    });
    function closeOutside(event) {
      if (!nav.hidden && !nav.contains(event.target) && !menuButton.contains(event.target)) closeAppMenu();
      if (!overflowPanel.contains(event.target) && !overflowButton.contains(event.target) &&
          !event.target.closest('#previewFormatPanel')) closeOverflow();
      if (!allTabsPanel.contains(event.target) && !allTabsButton.contains(event.target)) closeAllTabs();
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && openSub) {
        event.preventDefault(); hideSub(true);
      } else if (event.key === 'Escape' && !allTabsPanel.hidden) {
        event.preventDefault(); closeAllTabs(true);
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
    });
    refresh();
  }
  RV.Shell = { close: close, init: init, refresh: refresh, popupFocusTarget: popupFocusTarget, fitTabs: fitTabs, setPopup: setPopup };
}());
