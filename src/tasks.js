/*
 * src/tasks.js — task-list source mapping.
 *
 * The Markdown source is the single source of truth for task checkboxes. This module builds a
 * position-accurate map between the task checkboxes produced by the Markdown parser and the exact
 * 3-character marker ("[ ]" / "[x]" / "[X]") they came from, so a click in the preview can flip
 * that marker and nothing else.
 *
 * Mapping strategy (see README.md → "Interactive preview"):
 *   1. Walk the parser token tree in document order (list → list_item → nested list …).
 *   2. Track the source line of every node by counting newlines in the `raw` of the nodes that
 *      precede it. `raw` is verbatim source text, so this is exact.
 *   3. On that line, locate the marker with an anchored regex and record its character offsets.
 *   4. Verify the marker's checked state and its label against the token. Any disagreement means
 *      our line model does not match the parser's, so `ok` is false and interactive editing is
 *      turned off for the document instead of risking a wrong edit.
 *
 * The module is dependency free (no DOM, no marked) so it can be unit tested in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.Tasks = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** The whole marker, as it appears in the source. */
  var MARKER_RE = /^\[[ xX]\]$/;

  /**
   * A task marker at the start of a source line.
   *   1 = indent + optional blockquote markers + list bullet + spacing
   *   2 = the marker itself, always 3 characters
   * The lookahead keeps us from matching "[ ]x" style text that is not a checkbox.
   */
  var LINE_MARKER_RE = /^([ \t]*(?:>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)(\[[ xX]\])(?=[ \t]|$)/;

  var MARKER_LEN = 3;

  function buildLineStarts(source) {
    var starts = [0];
    for (var i = 0; i < source.length; i++) {
      if (source.charCodeAt(i) === 10) starts.push(i + 1);
    }
    return starts;
  }

  function countNewlines(text) {
    var n = 0;
    for (var i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
  }

  function firstLine(text) {
    var i = String(text == null ? '' : text).indexOf('\n');
    return i < 0 ? String(text == null ? '' : text) : String(text).slice(0, i);
  }

  function squash(text) {
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function childrenOf(node) {
    if (!node || typeof node !== 'object') return [];
    if (node.type === 'list') return node.items || [];
    return node.tokens || [];
  }

  /**
   * Build the ordered list of task checkboxes in `source`.
   *
   * @param {Array}  tokens top-level tokens from the Markdown lexer (document order)
   * @param {String} source the Markdown source the tokens were produced from
   * @returns {{tasks: Array, ok: Boolean, reason: String}} `tasks[i]` corresponds to the i-th
   *          checkbox rendered for the document. `ok` is false when the mapping could not be
   *          trusted; `reason` explains why (safe to show to a user).
   */
  function collectTasks(tokens, source) {
    var tasks = [];
    var problems = [];
    var lineStarts = buildLineStarts(source);

    function lineText(line) {
      if (line < 0 || line >= lineStarts.length) return null;
      var end = line + 1 < lineStarts.length ? lineStarts[line + 1] : source.length;
      return source.slice(lineStarts[line], end);
    }

    function record(node, line) {
      var where = 'line ' + (line + 1);
      var text = lineText(line);
      if (text === null) {
        problems.push('no source line for a task item at ' + where);
        return;
      }
      var m = LINE_MARKER_RE.exec(text.replace(/\r$/, ''));
      if (!m) {
        problems.push('no task marker found at ' + where);
        return;
      }
      var start = lineStarts[line] + m[1].length;
      var end = start + MARKER_LEN;
      var checked = m[2] !== '[ ]';

      if (checked !== !!node.checked) {
        problems.push('checkbox state mismatch at ' + where);
        return;
      }
      var label = squash(text.slice(m[1].length + MARKER_LEN));
      if (label !== squash(firstLine(node.text))) {
        problems.push('task text mismatch at ' + where);
        return;
      }
      tasks.push({
        index: tasks.length,
        line: line,
        start: start,
        end: end,
        checked: checked,
        label: label
      });
    }

    function walk(node, startLine) {
      if (!node || typeof node !== 'object') return 0;
      if (node.type === 'list_item' && node.task) record(node, startLine);
      var kids = childrenOf(node);
      var line = startLine;
      for (var i = 0; i < kids.length; i++) {
        line += walk(kids[i], line);
      }
      return countNewlines(node.raw || '');
    }

    var cursor = 0;
    for (var i = 0; i < (tokens || []).length; i++) {
      cursor += walk(tokens[i], cursor);
    }

    return {
      tasks: tasks,
      ok: problems.length === 0,
      reason: problems.length ? problems[0] : ''
    };
  }

  /** True when `text` is exactly a task marker ("[ ]", "[x]" or "[X]"). */
  function isMarker(text) {
    return MARKER_RE.test(text);
  }

  /**
   * Flip one task marker.
   *
   * Only the 3 marker characters are replaced: whitespace, indentation, list bullets, blank lines
   * and everything else in the document are byte-for-byte identical in the result.
   *
   * @param {String} source current Markdown source
   * @param {{start: Number, end: Number}} task an entry from collectTasks()
   * @returns {?{text: String, checked: Boolean, start: Number, end: Number}} null when the source
   *          at that position is no longer a marker (stale map) — the caller must not edit.
   */
  function toggleTask(source, task) {
    if (!task || typeof task.start !== 'number' || typeof task.end !== 'number') return null;
    if (task.start < 0 || task.end > source.length || task.end - task.start !== MARKER_LEN) return null;
    var current = source.slice(task.start, task.end);
    if (!isMarker(current)) return null;
    var checked = current !== '[ ]';
    var marker = checked ? '[ ]' : '[x]';
    return {
      text: source.slice(0, task.start) + marker + source.slice(task.end),
      checked: !checked,
      start: task.start,
      end: task.end
    };
  }

  return {
    MARKER_LEN: MARKER_LEN,
    collectTasks: collectTasks,
    toggleTask: toggleTask,
    isMarker: isMarker,
    countNewlines: countNewlines
  };
}));
