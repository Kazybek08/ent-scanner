// Раздел «Сканирование»: фото с камеры, фото из галереи, многостраничный PDF.
// Каждый бланк сразу сохраняется в память телефона вместе со сжатым фото; баллы считаются по ключам пробника.
import { recognize } from './omr.js';
import { imageFileToCanvas, pdfFileToCanvases, canvasToImageData, compressCanvas } from './image-input.js';
import { drawOverlay } from './overlay.js';
import { t, getLang } from './i18n.js';
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';
import { db, uid, setSetting } from './db.js';
import { $, el, fmtDate } from './util.js';
import { scoreSheet, orderProfiles } from './scoring.js';
import { getActiveTestId, subjectLabel } from './tests-screen.js';

let busy = false;
let urls = [];
let current = null;          // { test, students, results }

const ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
const ICON_ERR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';

export function initScan() {
  $('#scanCamera').addEventListener('change', e => takeFiles(e.target));
  $('#scanFiles').addEventListener('change', e => takeFiles(e.target));
  $('#scanTest').addEventListener('change', async e => { await setSetting('activeTest', e.target.value); renderScan(); });
  $('#sheetDialogClose').addEventListener('click', () => $('#sheetDialog').close());
  document.addEventListener('langchange', () => { if (!$('[data-screen=scan]').hidden) renderScan(); });
}

// ---------- Оценка сохранённого бланка ----------
export function evaluate(rec, { test, students, results }) {
  const out = { state: 'fail', flags: [], score: null, student: null, profiles: null };
  if (!rec.ok) return out;
  out.flags = [...rec.flags];
  out.student = rec.studentId ? students.find(s => s.id === rec.studentId) ?? null : null;
  if (rec.studentId && !out.student) out.flags.push({ kind: 'unknownStudent', id: rec.studentId });
  if (rec.studentId && results.some(r => r.id !== rec.id && r.ok && r.studentId === rec.studentId)) out.flags.push({ kind: 'duplicate', id: rec.studentId });
  out.profiles = orderProfiles(rec.subjects, [], DEFAULT_SUBJECTS);
  const key = rec.variant ? test?.keys?.[rec.variant] : null;
  if (rec.variant && !key) out.flags.push({ kind: 'noKeyVariant', variant: rec.variant });
  if (key) {
    const answers = Object.fromEntries(Object.entries(rec.answers).map(([s, qs]) => [s, Object.fromEntries(Object.entries(qs).map(([n, a]) => [n, a.marked]))]));
    out.score = scoreSheet({ answers, profiles: out.profiles, key });
    for (const m of out.score.missing) if (m.includes(':')) out.flags.push({ kind: 'noKeySubject', subject: m.split(':')[1] });
  }
  out.state = out.flags.length ? 'check' : 'ok';
  return out;
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
  list.textContent = '';
  if (!test) { $('#scanSummary').hidden = true; return; }

  const results = allResults.sort((a, b) => b.createdAt - a.createdAt);
  current = { test, students, results };
  $('#scanKeysWarn').hidden = Object.keys(test.keys ?? {}).length > 0;

  const counts = { ok: 0, check: 0, fail: 0 };
  for (const rec of results) {
    const ev = evaluate(rec, current);
    counts[ev.state]++;
    const url = URL.createObjectURL(rec.photo);
    urls.push(url);
    const badge = el('span', { class: 'result-badge' });
    let title, sub;
    if (rec.ok) {
      title = ev.student ? ev.student.name : `ID ${rec.studentIdRaw}`;
      const profiles = ev.profiles ? ev.profiles.map(subjectLabel).join(' + ') : '—';
      sub = `ID ${rec.studentIdRaw} · ${t('scan.variant')} ${rec.variantRaw} · ${profiles}`;
      badge.innerHTML = ev.flags.length ? ICON_WARN : ICON_OK;
      badge.append(ev.flags.length ? t('scan.check', { n: ev.flags.length }) : t('scan.ok'));
    } else {
      title = rec.label;
      sub = t(`scan.err.${rec.error}`);
      badge.innerHTML = ICON_ERR;
      badge.append(t('scan.fail'));
    }
    const score = ev.score
      ? el('span', { class: 'result-score' }, el('b', { text: String(ev.score.total) }), el('small', { text: ev.score.complete ? '/140' : '/…' }))
      : null;
    list.append(el('li', {},
      el('button', { type: 'button', class: `result result-${ev.state}`, onclick: () => openSheet(rec.id) },
        el('img', { src: url, alt: '', width: 48, height: 68 }),
        el('span', { class: 'result-body' },
          el('span', { class: 'result-title', text: title }),
          el('span', { class: 'result-sub', text: sub }),
          badge),
        score)));
  }
  const total = results.length;
  $('#scanSummary').hidden = !total;
  $('#scanSummary').textContent = t('scan.summary', { total, ok: counts.ok, check: counts.check, fail: counts.fail });
}

// ---------- Подробности по бланку ----------
function flagText(f) {
  const sec = key => SECTIONS.find(s => s.key === key)?.[getLang()] ?? key;
  switch (f.kind) {
    case 'answer': return t(`flag.answer.${f.reason}`, { section: sec(f.section), n: f.n, letters: f.letters });
    case 'id': case 'variant': return t(`flag.${f.kind}`, { col: f.column + 1, reason: t(`reason.${f.reason}`) });
    case 'subjects': return f.reason === 'weak' ? t('flag.subjects.weak') : t('flag.subjects', { count: f.count });
    case 'unknownStudent': return t('flag.unknownStudent', { id: f.id });
    case 'duplicate': return t('flag.duplicate', { id: f.id });
    case 'noKeyVariant': return t('flag.noKeyVariant', { variant: f.variant });
    case 'noKeySubject': return t('flag.noKeySubject', { subject: subjectLabel(f.subject) });
    default: return JSON.stringify(f);
  }
}

async function openSheet(id) {
  const rec = await db.get('results', id);
  if (!rec || !current) return;
  const ev = evaluate(rec, current);
  const dlg = $('#sheetDialog');
  $('#sheetDialogTitle').textContent = rec.ok ? (ev.student?.name ?? `ID ${rec.studentIdRaw}`) : rec.label;
  const notes = $('#sheetNotes');
  notes.textContent = '';
  const add = (text, cls = '') => notes.append(el('li', { class: cls, text }));
  if (!rec.ok) add(t(`scan.err.${rec.error}`), 'error');
  else {
    add(`ID ${rec.studentIdRaw} · ${t('scan.variant')} ${rec.variantRaw}${ev.profiles ? ' · ' + ev.profiles.map(subjectLabel).join(' + ') : ''}`, 'muted');
    if (ev.score) {
      const p = ev.score.parts;
      const part = (k, label) => `${label}: ${p[k].points ?? '—'}/${p[k].max || (k.startsWith('profile') ? 50 : k === 'history' ? 20 : 10)}`;
      add(`${t('scan.total')}: ${ev.score.total} / 140${ev.score.complete ? '' : ' (' + t('scan.incomplete') + ')'}`, 'score');
      add([part('history', subjectLabel('history')), part('mathLit', subjectLabel('mathLit')), part('reading', subjectLabel('reading')),
        part('profile1', ev.profiles ? subjectLabel(ev.profiles[0]) : 'P1'), part('profile2', ev.profiles ? subjectLabel(ev.profiles[1]) : 'P2')].join(' · '), 'muted');
    }
    ev.flags.forEach(f => add(flagText(f)));
    rec.warnings.forEach(w => add(t(`scan.warn.${w}`)));
    if (!ev.flags.length) add(t('scan.ok'), 'ok');
  }
  add(`${rec.label} · ${t('scan.time', { ms: rec.ms })}`, 'muted');
  $('#sheetDelete').onclick = async () => {
    if (!window.confirm(t('scan.deleteAsk'))) return;
    await db.del('results', rec.id);
    dlg.close();
    renderScan();
  };
  dlg.showModal();

  const canvas = $('#sheetCanvas');
  const url = URL.createObjectURL(rec.photo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cssW = canvas.parentElement.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = (cssW * dpr) / img.naturalWidth;
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.style.width = `${cssW}px`;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (rec.ok) drawOverlay(ctx, rec, rec.photoScale * k);
  } finally {
    URL.revokeObjectURL(url);
  }
}
