/* Shared installed-WebView check, evaluated by WebDriver or Android DevTools. */
(async function () {
  function check(value, message) { if (!value) throw new Error(message); }
  RVApp.loadSample(); RVApp.setMode('preview');
  await new Promise(function (resolve) { requestAnimationFrame(resolve); });
  var root = document.getElementById('preview');
  await RV.Diagrams.render(root);
  var source = RVApp.el.editor.value;
  document.getElementById('btnAppearance').click();
  var choice = document.getElementById('fontPersianChoice');
  var count = choice.options.length;
  ['Tahoma', 'Vazirmatn'].forEach(function (name) {
    choice.value = name; choice.dispatchEvent(new Event('input', { bubbles: true }));
    choice.dispatchEvent(new Event('change', { bubbles: true }));
    check(choice.options.length === count, 'Font preset list changed after selection');
  });
  await RV.Fonts.ready(); await RV.Diagrams.render(root);
  check(document.fonts.check('16px "RV Document Arabic"', 'سلام'), 'Bundled Arabic font did not load');
  var images = Array.from(root.querySelectorAll('.diagram-figure img'));
  var failure = root.querySelector('.diagram-message');
  check(!failure, failure ? failure.textContent : 'Diagram rendering reported an error');
  check(images.length === 7, 'Expected all seven offline diagram examples; found ' + images.length);
  await Promise.all(images.map(function (image) { return image.decode ? image.decode() : Promise.resolve(); }));
  check(images.every(function (image) { return image.complete && image.naturalWidth > 0; }), 'Diagram image did not decode');
  check(!root.querySelector('.diagram-message'), 'Diagram rendering reported an error');
  check(getComputedStyle(root.querySelector('.diagram-rendered')).borderTopWidth === '2px', 'Approved diagram frame missing');
  var mathUrl = images[images.length - 1].src;
  var svg = decodeURIComponent(mathUrl.slice(mathUrl.indexOf(',') + 1));
  check(svg.indexOf('<mfrac>') >= 0 && svg.indexOf('<mtable ') >= 0, 'Math structure missing from SVG');
  var probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-20000px;top:0;opacity:0;pointer-events:none';
  probe.innerHTML = svg; document.body.appendChild(probe);
  try {
    var fraction = probe.querySelector('math mfrac'), rows = probe.querySelectorAll('math mtable mtr');
    check(fraction.getBoundingClientRect().height > fraction.firstElementChild.getBoundingClientRect().height, 'Fraction did not lay out vertically');
    check(rows.length === 2 && rows[1].getBoundingClientRect().top > rows[0].getBoundingClientRect().top, 'Matrix rows did not lay out separately');
  } finally { probe.remove(); }
  document.getElementById('appearanceCancel').click(); await RV.Fonts.ready();
  check(RVApp.el.editor.value === source && !RVApp.state.dirty, 'Appearance changed the Markdown document');
  return { diagrams: 7, nativeMath: true, bundledFont: true, repeatFontSelection: true, frame2px: true };
}())
