(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RV.Structured = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_SOURCE = 1024 * 1024;
  var MAX_ROWS = 1500;
  var MAX_DEPTH = 48;
  var MARKDOWN = /\.(?:md|markdown|mdown|mdwn|mkd)$/i;

  function detect(name, source) {
    if (/\.json$/i.test(name)) return 'json';
    if (/\.ini$/i.test(name)) return 'ini';
    if (MARKDOWN.test(name) || source.length > MAX_SOURCE || !/^[ \t\r\n]*[\[{]/.test(source)) return 'markdown';
    try { JSON.parse(source); return 'json'; } catch (error) { return 'markdown'; }
  }

  function jsonRows(source) {
    JSON.parse(source);
    // Retain lexical values and duplicate keys. The parsed JavaScript object would lose both.
    var tokens = /[ \t\r\n]+|"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[Ee][+-]?\d+)?|true|false|null|[{}\[\]:,]/g;
    var colon = /[ \t\r\n]*:/y;
    var root = { children: [] }, stack = [root], match, line = 1, count = 0;
    while ((match = tokens.exec(source))) {
      var text = match[0], parent = stack[stack.length - 1];
      if (/^[ \t\r\n]/.test(text)) { line += text.split('\n').length - 1; continue; }
      if (text === ':' || text === ',') continue;
      if (text === '}' || text === ']') { stack.pop().endLine = line; continue; }
      colon.lastIndex = tokens.lastIndex;
      if (text[0] === '"' && colon.test(source)) {
        parent.key = { text: text.slice(1, -1) || '""', line: line };
        continue;
      }
      if (++count > MAX_ROWS || stack.length > MAX_DEPTH) return null;
      var row = {
        label: parent.key ? parent.key.text : (parent.text === '[' ? String(parent.children.length) : ''),
        line: parent.key ? parent.key.line : line, endLine: line, text: text,
        type: text[0] === '"' ? 'string' : (/^[-0-9]/.test(text) ? 'number' : 'literal')
      };
      parent.key = null;
      parent.children.push(row);
      if (text === '{' || text === '[') { row.children = []; stack.push(row); }
    }
    var value = root.children[0];
    return value.children && value.children.length ? value.children : [value];
  }

  function iniRows(source) {
    var lines = source.split('\n');
    if (lines.length > MAX_ROWS) return null;
    var rows = [], current = rows, section = null;
    lines.forEach(function (text, index) {
      var line = index + 1;
      if (!text.trim()) return;
      if (section) section.endLine = line;
      var heading = /^\s*\[([^\]]+)\]\s*([;#].*)?$/.exec(text);
      if (heading) {
        if (section) section.endLine = line - 1;
        section = { label: heading[1], line: line, endLine: line, children: [] };
        rows.push(section); current = section.children;
        if (heading[2]) current.push({ text: heading[2], type: 'comment' });
        return;
      }
      var comment = /^\s*[;#]/.test(text);
      var pair = !comment && /^([^=:]+)[=:](.*)$/.exec(text.trimStart());
      var label = pair ? pair[1].trimEnd() : '';
      var value = label ? pair[2].trimStart() : text;
      current.push({ label: label, text: value, line: line, endLine: line,
        type: comment ? 'comment' : label && /^-?\d+(?:\.\d+)?$/.test(value) ? 'number'
          : label && /^(true|false|null)$/i.test(value) ? 'literal' : label ? 'string' : '' });
    });
    return rows;
  }

  function create(doc, format, source, name, t, folds, onLayout, detected) {
    var ini = format === 'ini';
    var rows, error;
    try { rows = source.length <= MAX_SOURCE && (ini ? iniRows(source) : jsonRows(source)); }
    catch (err) { error = true; }
    var pending = [], entries = [];
    function add(parent, tag, text, className) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }
    var element = add(null, 'div', undefined, 'structured-view structured-' + format);
    element.dir = 'ltr';
    var heading = add(element, 'div', undefined, 'structured-heading');
    add(heading, 'bdi', name, 'structured-name');
    add(heading, 'span', format.toUpperCase(), 'structured-format');
    if (detected) add(heading, 'span', t('structured.detected'), 'structured-meta');
    if (!rows) {
      add(element, 'p', t(error ? 'structured.invalid' : 'structured.large'), 'structured-meta');
      add(element, 'pre', source, 'structured-raw');
    }

    var firstBranch = rows && rows.findIndex(function (row) { return row.children && row.children.length; });
    function draw(parent, list, path, top) {
      list.forEach(function (row, index) {
        var key = path + '/' + index;
        var expandable = row.children && (ini || row.children.length);
        var detail = expandable && add(parent, 'details', undefined, 'structured-details');
        var group = add(detail || parent, detail ? 'summary' : 'div', undefined,
          row.type === 'comment' ? 'structured-comment' : 'structured-row');
        var label = ini && detail ? '[' + row.label + ']' : row.label;
        if (label) add(group, 'bdi', label, 'structured-key');
        if (top) {
          group.id = 'rv-structure-' + index;
          entries.push({ el: detail || group, id: group.id, text: label, line: row.line, endLine: row.endLine,
            outline: !!label && (!ini || !!detail) });
        }
        if (!detail) {
          if (!ini && label) add(group, 'span', ':', 'structured-meta');
          var value = row.children ? (row.text === '[' ? '[]' : '{}') : row.text;
          add(group, 'bdi', value, 'structured-value ' + (row.type || ''));
          return;
        }
        if (!ini) add(group, 'span', row.text === '[' ? '[ ]' : '{ }', 'structured-meta');
        var count = ini ? row.children.filter(function (item) { return !!item.label; }).length : row.children.length;
        var kind = ini ? 'settings' : row.text === '[' ? 'items' : 'keys';
        add(group, 'span', t('structured.' + kind + (count === 1 ? '.one' : ''), { count: count }), 'structured-meta');
        var populated = false;
        function populate() {
          if (populated) return;
          populated = true;
          draw(add(detail, 'div', undefined, 'structured-branch'), row.children, key, false);
        }
        pending.push(populate);
        var open = folds && folds.get(key);
        detail.open = open === undefined ? top && (ini ? index - firstBranch < 3 : index === firstBranch) : open;
        if (detail.open) populate();
        detail.addEventListener('toggle', function () {
          if (folds) folds.set(key, detail.open);
          if (detail.open) populate();
          if (onLayout) onLayout();
        });
      });
    }
    if (rows) draw(element, rows, '', true);
    return { element: element, entries: entries, complete: function () {
      // Find and standalone export need the text in collapsed branches as well.
      for (var i = 0; i < pending.length; i++) pending[i]();
      pending.length = 0;
    } };
  }

  return { detect: detect, create: create };
}));
