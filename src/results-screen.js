// Вкладка «Результаты»: итоги пробника, рейтинг с фильтром по группе, средние по группам,
// баллы ученика со списком ошибок, выгрузка в Excel и резервная копия.
import { db } from './db.js';
import { t, getLang } from './i18n.js';
import { $, el, shareOrSave, loadExcelJS } from './util.js';
import { buildReport, PARTS } from './report.js';
import { buildWorkbook, subjectName } from './export-xlsx.js';
import { getAppSettings } from './app-settings.js';
import { openForm } from './form.js';
import { openEditor } from './editor.js';
import { saveBackup, backupStatus, backupStatusText } from './backup-ui.js';

let group = '';
let last = null;          // { report, test }
let renderToken = 0;

const SHORT = { kk: { history: 'ҚТ', mathLit: 'МС', reading: 'ОС' }, ru: { history: 'ИК', mathLit: 'МГ', reading: 'ГЧ' } };

export function initResults() {
  $('#resGroup').addEventListener('change', e => { group = e.target.value; draw(); });
  $('#resExcel').addEventListener('click', exportExcel);
  $('#resBackup').addEventListener('click', async () => { await saveBackup(); renderBackupNote(); });
  $('#studentResClose').addEventListener('click', () => $('#studentResDialog').close());
}

export async function renderResults(test) {
  const my = ++renderToken;
  if (!test) return;
  const [students, results, tests, allResults, settings] = await Promise.all([
    db.all('students'), db.byIndex('results', 'testId', test.id), db.all('tests'), db.all('results'), getAppSettings(),
  ]);
  if (my !== renderToken) return;
  const history = tests.map(x => ({ test: x, results: allResults.filter(r => r.testId === x.id) })).filter(x => x.results.length);
  const report = buildReport({ test, students, results, combos: settings.combos, thresholds: settings.thresholds, history });
  last = { report, test, settings };
  const groups = [...new Set(report.rows.map(r => r.group).filter(Boolean))];
  if (group && !groups.includes(group)) group = '';
  const sel = $('#resGroup');
  sel.textContent = '';
  sel.append(el('option', { value: '', text: t('res.allGroups') }), ...groups.map(g => el('option', { value: g, text: g, selected: g === group || null })));
  draw();
  renderBackupNote();
}

async function renderBackupNote() {
  const st = await backupStatus();
  const n = $('#resBackupNote');
  n.textContent = backupStatusText(st);
  n.classList.toggle('warn-text', st.newSince > 0);
}

function draw() {
  if (!last) return;
  const { report, settings } = last;
  const lang = getLang();
  const s = report.summary;
  $('#resEmpty').hidden = report.rows.length > 0;
  $('#resContent').hidden = !report.rows.length;
  $('#resSummary').textContent = '';
  $('#resSummary').append(
    stat(String(s.complete), t('res.counted', { n: s.sheets })),
    stat(s.avgTotal ?? '—', t('res.avg')),
    stat(`${s.passed}`, t('res.passed', { total: settings.thresholds.total })),
  );
  $('#resAvgLine').textContent = PARTS.filter(p => !p.startsWith('profile')).map(p => `${subjectName(p, lang)}: ${s.avg[p] ?? '—'}`).join(' · ');

  const list = $('#resList');
  list.textContent = '';
  for (const r of report.rows.filter(r => !group || r.group === group)) {
    const passBadge = r.pass === true ? el('span', { class: 'pass yes', text: t('res.pass') })
      : r.pass === false ? el('span', { class: 'pass no', text: t('res.fail') })
        : el('span', { class: 'pass unknown', text: t('res.notCounted') });
    const parts = r.total === null ? '' : [
      ...['history', 'mathLit', 'reading'].map(p => `${SHORT[lang][p]} ${r.parts[p] ?? '—'}`),
      ...[0, 1].map(i => `${subjectName(r.profiles[i], lang) || '—'} ${r.parts[i ? 'profile2' : 'profile1'] ?? '—'}`),
    ].join(' · ');
    list.append(el('li', {}, el('button', { type: 'button', class: 'rank-row', onclick: () => openStudent(r) },
      el('span', { class: 'rank', text: r.rank ?? '—' }),
      el('span', { class: 'row-main' },
        el('span', { class: 'row-title', text: r.name || `ID ${r.id}` }),
        el('span', { class: 'row-sub', text: [r.group, parts].filter(Boolean).join(' · ') }),
        el('span', { class: 'rank-badges' }, passBadge, r.flags ? el('span', { class: 'pass unknown', text: t('scan.check', { n: r.flags }) }) : null)),
      el('span', { class: 'result-score' }, el('b', { text: r.total ?? '—' }), el('small', { text: r.complete ? '/140' : '/…' })))));
  }

  // средние по группам
  const tb = $('#resGroups');
  tb.textContent = '';
  tb.append(el('tr', {}, [t('res.group'), t('res.count'), SHORT[lang].history, SHORT[lang].mathLit, SHORT[lang].reading, 'P1', 'P2', t('res.total'), t('res.passedShort')].map(h => el('th', { text: h }))));
  for (const g of report.groups) {
    tb.append(el('tr', {}, [g.group || '—', g.count, ...PARTS.map(p => g.avg[p]), g.avgTotal, g.passed].map(v => el('td', { text: v ?? '—' }))));
  }
}

function stat(value, label) {
  return el('div', { class: 'stat' }, el('b', { text: String(value) }), el('span', { text: label }));
}

function openStudent(r) {
  const lang = getLang();
  const dlg = $('#studentResDialog');
  $('#studentResTitle').textContent = r.name || `ID ${r.id}`;
  const body = $('#studentResBody');
  body.textContent = '';
  body.append(el('p', { class: 'row-sub', text: `ID ${r.id} · ${r.group || '—'} · ${t('scan.variant')} ${r.variant}` }));
  body.append(el('div', { class: 'edit-score' }, el('b', { text: r.total ?? '—' }), el('span', { text: '/ 140' })));
  const th = last.settings.thresholds;
  if (r.pass === true) body.append(el('p', { class: 'pass-line yes', text: t('res.passLine', { total: th.total }) }));
  else if (r.pass === false) body.append(el('p', { class: 'pass-line no', text: t('res.failLine', { what: r.fails.map(f => f === 'total' ? t('res.failTotal', { total: th.total }) : `${partName(f, r, lang)} < ${th.min[f]}`).join(', ') }) }));
  const tbl = el('table', { class: 'mini-table' });
  for (const p of PARTS) {
    const max = p.startsWith('profile') ? 50 : p === 'history' ? 20 : 10;
    tbl.append(el('tr', {}, el('td', { text: partName(p, r, lang) }), el('td', { text: `${r.parts[p] ?? '—'} / ${max}` })));
  }
  body.append(tbl);
  const wrongAll = PARTS.flatMap(p => (r.wrong[p] ?? []).map(w => ({ ...w, p })));
  body.append(el('h3', { class: 'edit-h', text: t('res.mistakes', { n: wrongAll.length }) }));
  for (const p of PARTS) {
    const ws = r.wrong[p] ?? [];
    if (!ws.length) continue;
    body.append(el('h4', { class: 'mist-h', text: partName(p, r, lang) }));
    body.append(el('ul', { class: 'mistakes' }, ws.map(w => el('li', {},
      el('b', { text: `№${w.n}` }), ' ',
      t('res.mistake', { marked: w.marked || '—', key: w.key }) + (w.points ? ` (${w.points}/2)` : ''),
      w.topic ? el('span', { class: 'row-sub', text: ` · ${w.topic}` }) : null))));
  }
  $('#studentResOpen').onclick = () => { dlg.close(); openEditor(r.recId, { onSaved: () => document.dispatchEvent(new CustomEvent('datachange')) }); };
  dlg.showModal();
}

function partName(p, r, lang) {
  if (p === 'profile1') return subjectName(r.profiles[0], lang) || 'P1';
  if (p === 'profile2') return subjectName(r.profiles[1], lang) || 'P2';
  return subjectName(p, lang);
}

async function exportExcel() {
  if (!last) return;
  openForm({
    title: t('res.excel'),
    message: t('res.excelLead'),
    fields: [{ name: 'lang', label: t('res.excelLang'), type: 'segmented', value: getLang(), options: [['kk', 'Қазақша'], ['ru', 'Русский']] }],
    submit: t('res.excelBtn'),
    onSubmit: async v => {
      const ExcelJS = await loadExcelJS();
      const wb = buildWorkbook(ExcelJS, last.report, { test: last.test, lang: v.lang });
      const buf = await wb.xlsx.writeBuffer();
      const safe = last.test.name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
      await shareOrSave(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safe} ${last.test.date}.xlsx`);
      return null;
    },
  });
}
