// Раздел «Сканирование»: фото с камеры, фото из галереи, многостраничный PDF.
import { recognize } from './omr.js';
import { imageFileToCanvas, pdfFileToCanvases, canvasToImageData, compressCanvas } from './image-input.js';
import { drawOverlay } from './overlay.js';
import { t, getLang } from './i18n.js';
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';

const $ = s => document.querySelector(s);
const items = [];          // результаты текущей пачки (сохранение в память телефона — следующий этап)
let busy = false;

const ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
const ICON_ERR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';

export function initScan() {
  $('#scanCamera').addEventListener('change', e => takeFiles(e.target));
  $('#scanFiles').addEventListener('change', e => takeFiles(e.target));
  $('#scanClear').addEventListener('click', () => {
    items.splice(0).forEach(i => URL.revokeObjectURL(i.photoUrl));
    renderAll();
  });
  $('#sheetDialogClose').addEventListener('click', () => $('#sheetDialog').close());
  document.addEventListener('langchange', renderAll);
}

async function takeFiles(input) {
  const files = [...input.files];
  input.value = '';
  if (!files.length || busy) return;
  busy = true;
  setStatus('');
  let done = 0;
  try {
    for (const file of files) {
      try {
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          for await (const p of pdfFileToCanvases(file)) {
            await handle(p.canvas, `${file.name} · ${p.page}/${p.pages}`);
            setStatus(t('scan.progress', { done: ++done }));
          }
        } else {
          await handle(await imageFileToCanvas(file), file.name);
          setStatus(t('scan.progress', { done: ++done }));
        }
      } catch (e) {
        console.error(e);
        setStatus(t('scan.err.file', { error: e.message || String(e) }), true);
      }
    }
    if (done) setStatus('');
  } finally {
    busy = false;
  }
}

async function handle(canvas, label) {
  const t0 = performance.now();
  const res = recognize(canvasToImageData(canvas));
  const ms = Math.round(performance.now() - t0);
  const photo = await compressCanvas(canvas);
  const item = {
    label, res, ms,
    photoUrl: URL.createObjectURL(photo.blob), photoScale: photo.scale,
    photoW: photo.width, photoH: photo.height,
    duplicate: res.ok && res.studentId && items.some(i => i.res.studentId === res.studentId),
  };
  items.push(item);
  renderAll();
  await new Promise(r => setTimeout(r, 0));          // дать экрану обновиться
}

function setStatus(text, error = false) {
  const el = $('#scanStatus');
  el.textContent = text;
  el.classList.toggle('error', error);
}

function stateOf(item) {
  if (!item.res.ok) return 'fail';
  return item.res.flags.length || item.duplicate ? 'check' : 'ok';
}

function subjectName(code) {
  const s = DEFAULT_SUBJECTS.find(x => x.code === code);
  return s ? s[getLang()] : code;
}

function renderAll() {
  const list = $('#scanResults');
  list.textContent = '';
  const counts = { ok: 0, check: 0, fail: 0 };
  items.forEach((item, idx) => {
    const st = stateOf(item);
    counts[st]++;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `result result-${st}`;
    btn.addEventListener('click', () => openSheet(idx));
    const img = document.createElement('img');
    img.src = item.photoUrl; img.alt = ''; img.width = 48; img.height = 68;
    const body = document.createElement('span');
    body.className = 'result-body';
    const title = document.createElement('span');
    title.className = 'result-title';
    const sub = document.createElement('span');
    sub.className = 'result-sub';
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    if (item.res.ok) {
      title.textContent = `ID ${item.res.studentIdRaw} · ${t('scan.variant')} ${item.res.variantRaw}`;
      sub.textContent = item.res.subjects.map(subjectName).join(' + ') || '—';
      const n = item.res.flags.length + (item.duplicate ? 1 : 0);
      badge.innerHTML = n ? ICON_WARN : ICON_OK;
      badge.append(n ? t('scan.check', { n }) : t('scan.ok'));
    } else {
      title.textContent = item.label;
      sub.textContent = t(`scan.err.${item.res.error}`);
      badge.innerHTML = ICON_ERR;
      badge.append(t('scan.fail'));
    }
    body.append(title, sub, badge);
    btn.append(img, body);
    li.append(btn);
    list.prepend(li);
  });
  const total = items.length;
  $('#scanSummary').hidden = !total;
  $('#scanClear').hidden = !total;
  $('#scanSummary').textContent = t('scan.summary', { total, ok: counts.ok, check: counts.check, fail: counts.fail });
}

function flagText(f) {
  const sec = key => SECTIONS.find(s => s.key === key)?.[getLang()] ?? key;
  if (f.kind === 'answer') return t(`flag.answer.${f.reason}`, { section: sec(f.section), n: f.n, letters: f.letters });
  if (f.kind === 'id' || f.kind === 'variant') return t(`flag.${f.kind}`, { col: f.column + 1, reason: t(`reason.${f.reason}`) });
  if (f.kind === 'subjects') return f.reason === 'weak' ? t('flag.subjects.weak') : t('flag.subjects', { count: f.count });
  return JSON.stringify(f);
}

async function openSheet(idx) {
  const item = items[idx];
  const dlg = $('#sheetDialog');
  $('#sheetDialogTitle').textContent = item.res.ok
    ? `ID ${item.res.studentIdRaw} · ${t('scan.variant')} ${item.res.variantRaw}` : item.label;
  const notes = $('#sheetNotes');
  notes.textContent = '';
  const add = (text, cls = '') => { const li = document.createElement('li'); li.textContent = text; if (cls) li.className = cls; notes.append(li); };
  if (!item.res.ok) add(t(`scan.err.${item.res.error}`), 'error');
  else {
    if (item.duplicate) add(t('scan.duplicate'));
    item.res.flags.forEach(f => add(flagText(f)));
    item.res.warnings.forEach(w => add(t(`scan.warn.${w}`)));
    if (!item.res.flags.length && !item.duplicate) add(t('scan.ok'), 'ok');
    add(`${item.label} · ${t('scan.time', { ms: item.ms })}`, 'muted');
  }
  dlg.showModal();

  const canvas = $('#sheetCanvas');
  const img = new Image();
  img.src = item.photoUrl;
  await img.decode();
  const cssW = canvas.parentElement.clientWidth;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = (cssW * dpr) / img.naturalWidth;
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  canvas.style.width = `${cssW}px`;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawOverlay(ctx, item.res, item.photoScale * k);
}
