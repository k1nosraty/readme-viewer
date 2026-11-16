import { AnnotationEditorType, AnnotationMode, getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { EventBus, FindState, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';

const asset = name => new URL(name, import.meta.url).href;
GlobalWorkerOptions.workerSrc = asset('./pdf.worker.mjs');
const byId = id => document.getElementById(id);
const container = byId('viewerContainer');
const findBar = byId('findBar');
const query = byId('findInput');
const message = byId('message');
const modeButtons = [[byId('highlight'), AnnotationEditorType.HIGHLIGHT], [byId('textBox'), AnnotationEditorType.FREETEXT]];
let options, pdf, viewer, bus, currentMatch = {}, saving = false;

function setChrome(next) {
  options = { ...options, ...next };
  document.documentElement.lang = options.locale;
  document.documentElement.dir = options.dir;
  document.documentElement.dataset.theme = options.theme;
  container.setAttribute('aria-label', options.translate('visual.previewOf', { name: options.name }));
  document.querySelectorAll('[data-text]').forEach(node => { node.textContent = options.translate(node.dataset.text); });
  document.querySelectorAll('[data-label]').forEach(node => {
    node.title = options.translate(node.dataset.label);
    node.setAttribute('aria-label', node.title);
  });
  if (pdf) updatePage();
}

function updatePage() {
  byId('pageNumber').textContent = options.translate('pdf.page', { page: viewer.currentPageNumber, count: pdf.numPages });
  byId('zoomValue').value = Math.round(viewer.currentScale * 100) + '%';
  byId('fitWidth').setAttribute('aria-pressed', String(viewer.currentScaleValue === 'page-width'));
}

function find(again = false, previous = false) {
  bus.dispatch('find', {
    source: query, type: again ? 'again' : '', query: query.value,
    caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false
  });
}

function openFind() {
  if (!pdf) return;
  findBar.hidden = false;
  byId('findButton').setAttribute('aria-expanded', 'true');
  query.focus();
  query.select();
}

function closeFind() {
  findBar.hidden = true;
  byId('findButton').setAttribute('aria-expanded', 'false');
  bus.dispatch('findbarclose', { source: query });
  container.focus();
}

function updateMatches() {
  const { current = 0, total = 0 } = currentMatch;
  byId('findCount').textContent = !query.value ? '' : total
    ? options.translate('pdf.matches', { current, total })
    : currentMatch.state === FindState.NOT_FOUND ? options.translate('pdf.noMatches') : '';
}

function zoom(steps, origin) {
  if (pdf) viewer.updateScale({ steps, origin });
}

function updateTools(mode) {
  for (const [button, tool] of modeButtons) {
    button.disabled = options.readOnly || mode === AnnotationEditorType.DISABLE;
    button.setAttribute('aria-pressed', String(mode === tool));
  }
}

async function open(bytes, setup) {
  setChrome(setup);
  message.textContent = options.translate('visual.loading');
  const task = getDocument({
    data: new Uint8Array(bytes), enableXfa: false, useWasm: false,
    cMapUrl: asset('./cmaps/'), cMapPacked: true, standardFontDataUrl: asset('./standard_fonts/'),
    wasmUrl: asset('./wasm/'), iccUrl: asset('./iccs/')
  });
  try {
    pdf = await task.promise;
    bus = new EventBus();
    const links = new PDFLinkService({ eventBus: bus });
    links.externalLinkEnabled = false;
    const findController = new PDFFindController({ eventBus: bus, linkService: links });
    viewer = new PDFViewer({
      container, eventBus: bus, linkService: links, findController, enableAutoLinking: false,
      enablePermissions: true, annotationMode: AnnotationMode.ENABLE,
      annotationEditorMode: options.readOnly ? AnnotationEditorType.DISABLE : AnnotationEditorType.NONE,
      annotationEditorHighlightColors: 'yellow=#FFFF98,green=#53FFBC,blue=#80EBFF,pink=#FFCBE0',
      enableHighlightFloatingButton: !options.readOnly, imageResourcesPath: asset('./images/'), maxCanvasPixels: 16777216
    });
    links.setViewer(viewer);
    links.setDocument(pdf);
    pdf.annotationStorage.onSetModified = options.onEdit;
    bus.on('pagechanging', updatePage);
    bus.on('scalechanging', updatePage);
    bus.on('annotationeditormodechanged', event => updateTools(event.mode));
    bus.on('updatefindmatchescount', event => { currentMatch = { ...currentMatch, ...event.matchesCount }; updateMatches(); });
    bus.on('updatefindcontrolstate', ({ state, matchesCount }) => { currentMatch = { ...matchesCount, state }; updateMatches(); });
    bus.on('pagesinit', () => {
      viewer.currentScaleValue = 'page-width';
      for (const id of ['zoomOut', 'zoomIn', 'fitWidth', 'findButton']) byId(id).disabled = false;
      updateTools(viewer.annotationEditorMode);
      updatePage();
      message.hidden = true;
    });
    viewer.setDocument(pdf);
  } catch (error) {
    message.textContent = options.translate('pdf.openError');
    await task.destroy();
    throw error;
  }
}

async function serialize() {
  saving = true;
  if (document.activeElement?.closest('.annotationEditorLayer')) document.activeElement.blur();
  container.inert = true;
  byId('toolbar').inert = true;
  if (![AnnotationEditorType.DISABLE, AnnotationEditorType.NONE].includes(viewer.annotationEditorMode)) {
    const changed = new Promise(resolve => bus.on('annotationeditormodechanged', resolve, { once: true }));
    viewer.annotationEditorMode = { mode: AnnotationEditorType.NONE };
    await changed;
  }
  return pdf.annotationStorage.size ? pdf.saveDocument() : pdf.getData();
}

function releaseSave() {
  saving = false;
  container.inert = false;
  byId('toolbar').inert = false;
}

byId('zoomOut').onclick = () => zoom(-1);
byId('zoomIn').onclick = () => zoom(1);
byId('fitWidth').onclick = () => { viewer.currentScaleValue = 'page-width'; };
byId('findButton').onclick = () => { if (findBar.hidden) openFind(); else closeFind(); };
byId('findClose').onclick = closeFind;
byId('findPrevious').onclick = () => find(true, true);
byId('findNext').onclick = () => find(true);
query.oninput = () => find();
for (const [button, mode] of modeButtons) {
  button.addEventListener('mousedown', event => { if (window.getSelection()?.toString()) event.preventDefault(); });
  button.onclick = () => {
    viewer.annotationEditorMode = { mode: viewer.annotationEditorMode === mode ? AnnotationEditorType.NONE : mode };
  };
}
container.addEventListener('input', event => {
  if (event.target.closest('.freeTextEditor')) options.onEdit?.();
});
container.addEventListener('wheel', event => {
  if (!event.ctrlKey || !event.deltaY || saving) return;
  event.preventDefault();
  zoom(event.deltaY < 0 ? 1 : -1, [event.clientX, event.clientY]);
}, { passive: false });
document.addEventListener('keydown', event => {
  if (event.isComposing || event.altKey) return;
  const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
  if (mod && key === 'f') openFind();
  else if (mod && key === 'g' && !findBar.hidden) find(true, event.shiftKey);
  else if (mod && key === 's' && !options?.readOnly && !saving) options.onSave?.(event.shiftKey);
  else if (mod && key === 'tab') options?.onCycle?.(event.shiftKey);
  else if (mod && (key === '+' || key === '=' || key === '-') && !saving) zoom(key === '-' ? -1 : 1);
  else if (mod && key === '0' && pdf) viewer.currentScaleValue = 'page-width';
  else if (event.target === query && key === 'enter') find(true, event.shiftKey);
  else if (key === 'escape' && !findBar.hidden) closeFind();
  else return;
  event.preventDefault();
  event.stopPropagation();
}, true);

window.RVPdfReader = { open, setChrome, openFind, serialize, releaseSave };
