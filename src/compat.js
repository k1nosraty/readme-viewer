/* Small standard-library shims for older Android WebView engines. */
(function () {
  'use strict';
  function indexAt(length, index) {
    var value = Number(index) || 0;
    value = value < 0 ? Math.ceil(value) : Math.floor(value);
    return value < 0 ? length + value : value;
  }
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true, writable: true,
      value: function (index) {
        if (this == null) throw new TypeError('Array.at requires an object');
        var length = Math.min(Math.max(Math.floor(Number(this.length) || 0), 0), 9007199254740991);
        var at = indexAt(length, index);
        return at < 0 || at >= length ? undefined : this[at];
      }
    });
  }
  if (!String.prototype.at) {
    Object.defineProperty(String.prototype, 'at', {
      configurable: true, writable: true,
      value: function (index) {
        if (this == null) throw new TypeError('String.at requires a string');
        var text = String(this);
        var at = indexAt(text.length, index);
        return at < 0 || at >= text.length ? undefined : text.charAt(at);
      }
    });
  }
  if (!Object.hasOwn) {
    Object.defineProperty(Object, 'hasOwn', {
      configurable: true, writable: true,
      value: function (object, key) {
        if (object == null) throw new TypeError('Object.hasOwn requires an object');
        return Object.prototype.hasOwnProperty.call(object, key);
      }
    });
  }
}());
