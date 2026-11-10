(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RV.Code = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EXTENSIONS = {
    c: 'c', h: 'cpp', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
    py: 'python', pyw: 'python', pyi: 'python', kt: 'kotlin', kts: 'kotlin', java: 'java',
    html: 'xml', htm: 'xml', xhtml: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml',
    css: 'css', scss: 'scss', less: 'less', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    cjs: 'javascript', ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish', ps1: 'powershell', bat: 'dos', cmd: 'dos',
    rs: 'rust', go: 'go', cs: 'csharp', php: 'php', rb: 'ruby', swift: 'swift', lua: 'lua',
    sql: 'sql', yml: 'yaml', yaml: 'yaml', toml: 'ini', jsonc: 'json', jsonl: 'json', ndjson: 'json',
    diff: 'diff', patch: 'diff', dockerfile: 'dockerfile', cmake: 'cmake', make: 'makefile'
  };
  var FILENAMES = { dockerfile: 'dockerfile', makefile: 'makefile', gnumakefile: 'makefile',
    'cmakelists.txt': 'cmake', 'nginx.conf': 'nginx', '.bashrc': 'bash', '.zshrc': 'bash', '.env': 'bash' };
  var BRACES = /^(c|cpp|kotlin|java|css|scss|less|javascript|typescript|rust|go|csharp|php|swift|nginx|json)$/;
  var HTML = /\.(?:html?|xhtml|vue|svelte)$/i;
  var MAX_CHARS = 160 * 1024;
  var MAX_LINES = 2500;

  function language(name, source) {
    var file = name.toLowerCase();
    var ext = file.slice(file.lastIndexOf('.') + 1);
    if (Object.prototype.hasOwnProperty.call(FILENAMES, file)) return FILENAMES[file];
    if (file.indexOf('.') >= 0 && Object.prototype.hasOwnProperty.call(EXTENSIONS, ext)) return EXTENSIONS[ext];
    if (/^readme(?:\.txt)?$|\.(?:md|markdown|mdown|mdwn|mkd|ini|json)$/i.test(file)) return '';
    var header = source.slice(0, 8192);
    if (/^\s*(?:<!doctype\s+html[\s>]|<html[\s>])/i.test(header)) return 'xml';
    if (/\.(?:conf|cfg)$/i.test(file) && /(?:^|\n)[ \t]*(?:http|events|server|location|upstream)\b[^\n;{}]*\{/.test(header)) return 'nginx';
    var shebang = /^#![^\n]{0,250}\b(python[\d.]*|bash|zsh|sh|fish|ruby|node|perl)(?=\s|$)/.exec(source);
    if (!shebang) return '';
    var command = shebang[1];
    if (command.indexOf('python') === 0) return 'python';
    if (/^(sh|bash|zsh)$/.test(command)) return 'bash';
    return command === 'node' ? 'javascript' : command;
  }

  function addRange(ranges, start, end) {
    if (end > start && end > (ranges.get(start) || 0)) ranges.set(start, end);
  }

  function braceRanges(lines, ranges) {
    var stack = [];
    lines.forEach(function (text, line) {
      var first = text.search(/\S/), lastOpen = text.lastIndexOf('{');
      for (var pos = 0; pos < text.length; pos++) {
        if (text[pos] === '{') {
          var previous = pos === first && line && lines[line - 1].trim();
          stack.push(previous && !/[;{}:]$/.test(previous) ? line - 1 : line);
        } else if (text[pos] === '}' && stack.length) {
          // A closing line can also start a sibling block, such as an else clause.
          addRange(ranges, stack.pop(), pos < lastOpen ? line - 1 : line);
        }
      }
    });
  }

  function pythonRanges(lines, ranges, continuations) {
    var stack = [], depth = 0, logical = null, end = -1;
    function close() {
      var block = stack.pop();
      if (end > block.headerEnd) addRange(ranges, block.start, end);
    }
    lines.forEach(function (line, index) {
      var text = line.trim();
      if (!logical && !text) {
        if (continuations && continuations[index]) end = index;
        return;
      }
      if (!logical) {
        var indent = 0;
        for (var i = 0; i < line.length && /[ \t]/.test(line[i]); i++) indent += line[i] === '\t' ? 8 - indent % 8 : 1;
        logical = { start: index, indent: indent,
          header: /^(?:async\s+)?(?:def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b/.test(text) };
        while (stack.length && stack[stack.length - 1].indent >= indent) close();
      }
      for (var pos = 0; pos < text.length; pos++) {
        if ('([{'.indexOf(text[pos]) >= 0) depth++;
        if (')]}'.indexOf(text[pos]) >= 0) depth = Math.max(0, depth - 1);
      }
      if (depth || /\\$/.test(text)) return;
      if (logical.header && /:$/.test(text)) stack.push({ start: logical.start, indent: logical.indent, headerEnd: index });
      logical = null;
      end = index;
    });
    while (stack.length) close();
  }

  function tagRanges(lines, ranges, html) {
    var source = lines.join('\n');
    var tags = /<(\/?)([A-Za-z_][\w:.-]*)(?=[\s/>])([^<>]*?)>/g, match, stack = [];
    var offset = 0, line = 0, raw = '';
    while ((match = tags.exec(source))) {
      while (offset < match.index) { if (source[offset++] === '\n') line++; }
      var name = html ? match[2].toLowerCase() : match[2];
      if (raw && (!match[1] || name !== raw)) continue;
      if (match[1]) {
        raw = '';
        var found = stack.length - 1;
        while (found >= 0 && stack[found].name !== name) found--;
        if (found >= 0) {
          addRange(ranges, stack[found].line, line);
          stack.length = found;
        }
      } else if (!/\/\s*$/.test(match[3]) && !(html && /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(name))) {
        if (stack.length >= 128) break;
        stack.push({ name: name, line: line });
        if (html && /^(script|style|textarea|title)$/.test(name)) raw = name;
      }
    }
  }

  function foldRanges(lines, lang, html, continuations) {
    var ranges = new Map();
    if (lang === 'python') pythonRanges(lines, ranges, continuations);
    else if (lang === 'xml') tagRanges(lines, ranges, html);
    else if (BRACES.test(lang)) braceRanges(lines, ranges);
    return ranges;
  }

  function coloredLines(doc, code, lang) {
    var lines = [], mask = [], continuations = [], current = doc.createDocumentFragment(), text = '';
    function emit(node, ancestors, ignored, marker) {
      if (node.nodeType !== 3) {
        var scope = node.className || '';
        var shield = /(?:^|\s)hljs-(?:string|comment|regexp|cdata)(?:\s|$)/.test(scope) ||
          (/^(c|cpp)$/.test(lang) && /(?:^|\s)hljs-meta(?:\s|$)/.test(scope));
        var first = !ignored && shield && /(?:^|\s)hljs-string(?:\s|$)/.test(scope);
        var mark = first ? { pending: true } : marker;
        var chain = scope ? ancestors.concat(scope) : ancestors;
        Array.prototype.forEach.call(node.childNodes, function (child) { emit(child, chain, ignored || shield, mark); });
        return;
      }
      node.nodeValue.split('\n').forEach(function (part, index) {
        if (index) { lines.push(current); mask.push(text); current = doc.createDocumentFragment(); text = ''; }
        if (!part) return;
        var parent = current;
        ancestors.forEach(function (scope) {
          var span = doc.createElement('span'); span.className = scope; parent.appendChild(span); parent = span;
        });
        parent.appendChild(doc.createTextNode(part));
        if (!ignored) text += part;
        else {
          if (marker && !marker.pending && !text.trim()) continuations[lines.length] = true;
          text += (marker && marker.pending ? 'x' : ' ') + ' '.repeat(part.length - 1);
          if (marker) marker.pending = false;
        }
      });
    }
    Array.prototype.forEach.call(code.childNodes, function (node) { emit(node, [], false, null); });
    lines.push(current); mask.push(text);
    return { lines: lines, mask: mask, continuations: continuations };
  }

  function create(doc, format, source, name, t, highlight, options) {
    options = options || {};
    var lang = format.slice(5), entries = [];
    function add(parent, tag, className, text) {
      var node = doc.createElement(tag);
      node.className = className || '';
      if (text !== undefined) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }
    var element = add(null, 'div', 'code-view');
    element.dir = 'ltr';
    var head = add(element, 'div', 'structured-heading');
    add(head, 'bdi', 'structured-name', name);
    var label = ({ xml: HTML.test(name) ? 'HTML' : 'XML', cpp: 'C++', csharp: 'C#',
      javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', kotlin: 'Kotlin' })[lang];
    add(head, 'span', 'structured-format', lang ? label || lang.toUpperCase() : t('structured.text'));
    if (options.edit) options.edit(head, 0, source.length, t('previewEdit.file'));
    var body = add(element, 'div', 'code-surface');
    var pre = add(body, 'pre', 'code-raw');
    var code = add(pre, 'code', lang ? 'language-' + lang : '', source);
    if (source.length > MAX_CHARS || source.split('\n', MAX_LINES + 1).length > MAX_LINES) {
      add(head, 'span', 'structured-meta', t('code.large'));
    } else {
      var building = true;
      var draw = function () {
        var colored = coloredLines(doc, code, lang);
        var ranges = code.classList.contains('hljs') ? foldRanges(colored.mask, lang, HTML.test(name), colored.continuations) : new Map();
        var raw = source.split('\n'), stack = [], offsets = [0];
        raw.forEach(function (line, index) { offsets.push(offsets[index] + line.length + 1); });
        pre.remove();
        body.style.setProperty('--code-digits', String(raw.length).length + 'ch');
        colored.lines.forEach(function (fragment, index) {
          while (stack.length && index > stack[stack.length - 1].end) stack.pop();
          var parent = stack.length ? stack[stack.length - 1].element : body;
          var end = ranges.get(index);
          var collapsible = end !== undefined && stack.length < 48 && (!stack.length || end <= stack[stack.length - 1].end);
          var detail = collapsible && add(parent, 'details', 'code-fold');
          var row = add(detail || parent, detail ? 'summary' : 'div', 'code-line');
          var number = options.edit ? options.edit(row, offsets[index], offsets[index + 1] - 1, t('previewEdit.line', { line: index + 1 })) : add(row, 'span', '');
          number.classList.add('code-number');
          number.dataset.line = index + 1;
          if (options.edit) {
            number.classList.remove('btn');
            number.textContent = '';
          } else number.setAttribute('aria-hidden', 'true');
          add(row, 'span', 'code-marker').setAttribute('aria-hidden', 'true');
          add(row, 'code', 'code-line-text').appendChild(fragment);
          if (options.edit && detail) options.edit(row, offsets[index], offsets[end + 1] - 1, t('previewEdit.block'));
          if (detail) {
            add(row, 'span', 'code-hidden-count', t('code.hidden', { count: end - index }));
            if (!stack.length) {
              row.id = 'rv-code-' + index;
              entries.push({ el: detail, id: row.id, line: index + 1, endLine: end + 1, outline: true, text: raw[index].trim().slice(0, 100) });
            }
            detail.open = !options.folds || options.folds.get(index) !== false;
            detail.addEventListener('toggle', function () {
              if (options.folds) options.folds.set(index, detail.open);
              if (options.layout) options.layout();
            });
            stack.push({ element: detail, end: end });
          }
        });
        if (!building && options.layout) options.layout(true);
      };
      if (lang && highlight) highlight.block(code, draw);
      else draw();
      building = false;
    }
    return { element: element, entries: entries };
  }

  return { language: language, create: create, foldRanges: foldRanges };
}));
