// Раздел «Сканирование»: фото с камеры, фото из галереи, многостраничный PDF.
// Каждый бланк сразу сохраняется в память телефона вместе со сжатым фото; баллы считаются по ключам пробника.
import { recognize } from './omr.js';
import { imageFileToCanvas, pdfFileToCanvases, canvasToImageData, compressCanvas } from './image-input.js';
import { t } from './i18n.js';
import { db, uid, setSetting } from './db.js';
import { $, el, fmtDate } from './util.js';
import { getActiveTestId } from './tests-screen.js';
import { evaluate } from './results.js';
import { renderResultList } from './result-list.js';
import { openEditor } from './editor.js';

let busy = false;
let urls = [];

export function initScan() {
  $('#scanCamera').addEventListener('change', e => takeFiles(e.target));
  $('#scanFiles').addEventListener('change', e => takeFiles(e.target));
  $('#scanTest').addEventListener('change', async e => { await setSetting('activeTest', e.target.value); renderScan(); });
  document.addEventListener('langchange', () => { if (!$('[data-screen=scan]').hidden) renderScan(); });
}

// ---------- Загрузка файлов ----------
async function takeFiles(input) {
  const files = [...input.files];
  input.value = '';
  if (!files.length || busy) return;
  const testId = $('#scanTest').value;
  if (!testId) return;
  busy = true;
  setStatus('');
  let done = 0;
  try {
    for (const file of files) {
      try {
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          for await (const p of pdfFileToCanvases(file)) {
            await handle(testId, p.canvas, `${file.name} · ${p.page}/${p.pages}`);
            setStatus(t('scan.progress', { done: ++done }));
          }
        } else {
          await handle(testId, await imageFileToCanvas(file), file.name);
          setStatus(t('scan.progress', { done: ++done }));
        }
      } catch (e) {
        console.error(e);
        setStatus(t('scan.err.file', { error: e.message || String(e) }), true);
      }
    }
    if (done) setStatus(t('scan.saved', { n: done }));
  } finally {
    busy = false;
  }
}

async function handle(testId, canvas, label) {
  const t0 = performance.now();
  const res = recognize(canvasToImageData(canvas));
  const ms = Math.round(performance.now() - t0);
  const photo = await compressCanvas(canvas);
  const rec = {
    id: uid(), testId, createdAt: Date.now(), label, ms,
    ok: res.ok, error: res.error ?? null,
    studentId: res.studentId ?? null, studentIdRaw: res.studentIdRaw ?? null,
    variant: res.variant ?? null, variantRaw: res.variantRaw ?? null,
    subjects: res.subjects ?? [],
    answers: res.answers ?? {}, flags: res.flags ?? [], warnings: res.warnings ?? [], marks: res.marks ?? [],
    H: res.H ?? null, photo: photo.blob, photoScale: photo.scale,
  };
  await db.put('results', rec);
  await renderScan();
  await new Promise(r => setTimeout(r, 0));
}

function setStatus(text, error = false) {
  const s = $('#scanStatus');
  s.textContent = text;
  s.classList.toggle('error', error);
}

// ---------- Список ----------
let renderToken = 0;
export async function renderScan() {
  const my = ++renderToken;           // если пока ждали данные, начался новый показ — этот бросаем
  const tests = (await db.all('tests')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const activeId = await getActiveTestId();
  const students = await db.all('students');
  const allResults = activeId ? await db.byIndex('results', 'testId', activeId) : [];
  if (my !== renderToken) return;

  const sel = $('#scanTest');
  sel.textContent = '';
  for (const test of tests) sel.append(el('option', { value: test.id, text: `${test.name} · ${fmtDate(test.date)}`, selected: test.id === activeId || null }));
  const test = tests.find(x => x.id === activeId) ?? null;
  $('#scanNoTest').hidden = !!test;
  $('#scanControls').hidden = !test;
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  const list = $('#scanResults');
  if (!test) { list.textContent = ''; $('#scanSummary').hidden = true; return; }

  const results = allResults.sort((a, b) => b.createdAt - a.createdAt);
  const ctx = { test, students, results };
  $('#scanKeysWarn').hidden = Object.keys(test.keys ?? {}).length > 0;

  const counts = { ok: 0, check: 0, fail: 0 };
  for (const rec of results) counts[evaluate(rec, ctx).state]++;
  const toCheck = results.filter(r => evaluate(r, ctx).state !== 'ok').map(r => r.id).reverse();
  urls = renderResultList(list, results, ctx, id => openEditor(id, { queue: toCheck.includes(id) ? toCheck : [id], onSaved: renderScan }));
  $('#scanSummary').hidden = !results.length;
  $('#scanSummary').textContent = t('scan.summary', { total: results.length, ok: counts.ok, check: counts.check, fail: counts.fail });
  $('#scanReviewLink').hidden = !counts.check;
}
