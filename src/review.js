// Раздел «Проверка и результаты». Вкладка «Проверка» — бланки с замечаниями по порядку;
// вкладка «Результаты» — рейтинг, группы, Excel, резервная копия (results-screen.js).
import { t } from './i18n.js';
import { db, setSetting } from './db.js';
import { $, el, fmtDate } from './util.js';
import { getActiveTestId } from './tests-screen.js';
import { evaluate } from './results.js';
import { renderResultList } from './result-list.js';
import { openEditor } from './editor.js';
import { renderResults } from './results-screen.js';
import { getAppSettings } from './app-settings.js';

let filter = 'check';
let tab = 'check';
let urls = [];
let renderToken = 0;
const collator = new Intl.Collator(['kk', 'ru'], { sensitivity: 'base', numeric: true });

export function initReview() {
  $('#reviewTest').addEventListener('change', async e => { await setSetting('activeTest', e.target.value); renderReview(); });
  document.querySelectorAll('#reviewFilter button').forEach(b => b.addEventListener('click', () => { filter = b.dataset.value; renderReview(); }));
  document.querySelectorAll('#reviewTabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.value; renderReview(); }));
  $('#reviewStart').addEventListener('click', () => { const first = $('#reviewStart').dataset.first; if (first) openFromQueue(first); });
  document.addEventListener('langchange', () => { if (!$('[data-screen=review]').hidden) renderReview(); });
}

let queue = [];
function openFromQueue(id) {
  openEditor(id, { queue: queue.includes(id) ? queue : [id], onSaved: renderReview });
}

export async function renderReview() {
  const my = ++renderToken;
  const tests = (await db.all('tests')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const activeId = await getActiveTestId();
  const students = await db.all('students');
  const results = activeId ? await db.byIndex('results', 'testId', activeId) : [];
  const { combos } = await getAppSettings();
  if (my !== renderToken) return;

  const sel = $('#reviewTest');
  sel.textContent = '';
  for (const test of tests) sel.append(el('option', { value: test.id, text: `${test.name} · ${fmtDate(test.date)}`, selected: test.id === activeId || null }));
  const test = tests.find(x => x.id === activeId) ?? null;
  $('#reviewNoTest').hidden = !!test;
  $('#reviewBody').hidden = !test;
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  if (!test) return;

  document.querySelectorAll('#reviewTabs button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === tab)));
  $('#reviewCheckPanel').hidden = tab !== 'check';
  $('#resPanel').hidden = tab !== 'results';

  const ctx = { test, students, results, combos };
  const evs = new Map(results.map(r => [r.id, evaluate(r, ctx)]));
  const need = results.filter(r => evs.get(r.id).state !== 'ok').sort((a, b) => a.createdAt - b.createdAt);   // в порядке сканирования
  $('#reviewTabCount').textContent = need.length ? String(need.length) : '';
  if (tab === 'results') { $('#reviewList').textContent = ''; await renderResults(test); return; }

  const name = r => evs.get(r.id).student?.name ?? `~${r.studentIdRaw ?? r.label}`;
  const all = [...results].sort((a, b) => collator.compare(name(a), name(b)));
  queue = need.map(r => r.id);

  document.querySelectorAll('#reviewFilter button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === filter)));
  $('#reviewCountCheck').textContent = String(need.length);
  $('#reviewCountAll').textContent = String(results.length);
  $('#reviewStart').hidden = !need.length;
  $('#reviewStart').dataset.first = need[0]?.id ?? '';
  $('#reviewDone').hidden = need.length > 0 || !results.length;
  $('#reviewEmpty').hidden = results.length > 0;

  const shown = filter === 'check' ? need : all;
  urls = renderResultList($('#reviewList'), shown, ctx, openFromQueue);
}
