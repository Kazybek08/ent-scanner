// Выгрузка пробника в Excel (ExcelJS — умеет цвета, ошибки красным). Язык — қаз или рус, выбирается при выгрузке.
import { PARTS } from './report.js';
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';

const L = {
  kk: {
    summary: 'Қорытынды', answers: 'Жауаптар', analysis: 'Сұрақтар талдауы', dynamics: 'Динамика', groups: 'Топтар',
    rank: 'Орын', id: 'ID', name: 'Аты-жөні', group: 'Тобы', variant: 'Нұсқа', p1: 'Бейіндік пән 1', p2: 'Бейіндік пән 2',
    total: 'Барлығы', pass: 'Шекті балл', yes: 'өтті', no: 'өтпеді', unknown: 'есептелмеді', note: 'Ескерту',
    manual: 'қолмен түзетілген', flags: 'тексеру керек: {n}', dup: 'бірнеше скан: {n}', key: 'Кілт', subject: 'Пән',
    n: '№', correctPct: 'Дұрыс, %', avgPoints: 'Орташа балл', commonWrong: 'Жиі қате жауап', topic: 'Тақырып', top10: 'Ең қиын 10',
    count: 'Оқушылар', passed: 'Шекті балдан өтті', avg: 'Орташа', change: 'Өзгеріс', title: 'Сынақ ҰБТ нәтижелері',
    legend: 'Қызыл — қате жауап, сары — жауап жоқ.', noName: '(тізімде жоқ)',
    creative: 'Шығармашылық (тарих + оқу, 30-дан)',
  },
  ru: {
    summary: 'Итоги', answers: 'Ответы', analysis: 'Анализ вопросов', dynamics: 'Динамика', groups: 'Группы',
    rank: 'Место', id: 'ID', name: 'ФИО', group: 'Группа', variant: 'Вариант', p1: 'Профиль 1', p2: 'Профиль 2',
    total: 'Итого', pass: 'Порог', yes: 'прошёл', no: 'не прошёл', unknown: 'не посчитан', note: 'Замечания',
    manual: 'исправлен вручную', flags: 'проверить: {n}', dup: 'несколько сканов: {n}', key: 'Ключ', subject: 'Предмет',
    n: '№', correctPct: 'Верно, %', avgPoints: 'Средний балл', commonWrong: 'Частый неверный ответ', topic: 'Тема', top10: 'Топ-10 трудных',
    count: 'Учеников', passed: 'Прошли порог', avg: 'Среднее', change: 'Изменение', title: 'Результаты пробного ЕНТ',
    legend: 'Красный — неверный ответ, жёлтый — нет ответа.', noName: '(нет в списке)',
    creative: 'Творчество (история + чтение, из 30)',
  },
};
const fmt = (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p[k]);

export function subjectName(code, lang) {
  const s = SECTIONS.find(x => x.key === code) ?? DEFAULT_SUBJECTS.find(x => x.code === code);
  return s ? s[lang] : (code ?? '');
}
const SHORT = {
  kk: { history: 'ҚТ', mathLit: 'МС', reading: 'ОС', profile1: 'Б1', profile2: 'Б2' },
  ru: { history: 'ИК', mathLit: 'МГ', reading: 'ГЧ', profile1: 'П1', profile2: 'П2' },
};
const COUNTS = { history: 20, mathLit: 10, reading: 10, profile1: 40, profile2: 40 };

const FILL = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const RED = FILL('FFFCA5A5'), YELLOW = FILL('FFFEF08A'), HEAD = FILL('FFD1FAE5'), GREEN = FILL('FFBBF7D0'), GREY = FILL('FFF1F5F9');

function header(ws, values) {
  const row = ws.addRow(values);
  row.font = { bold: true };
  row.eachCell(c => { c.fill = HEAD; c.alignment = { vertical: 'middle', wrapText: true }; });
  return row;
}

/**
 * @param {object} ExcelJS
 * @param {object} report   buildReport(...)
 * @param {object} o        { test, lang: 'kk'|'ru' }
 */
export function buildWorkbook(ExcelJS, report, { test, lang = 'ru' }) {
  const t = L[lang];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ENT scanner';
  wb.created = new Date();

  // ---- Итоги ----
  const s1 = wb.addWorksheet(t.summary, { views: [{ state: 'frozen', ySplit: 3 }] });
  s1.addRow([`${t.title}: ${test.name} · ${(test.date || '').split('-').reverse().join('.')}`]).font = { bold: true, size: 13 };
  s1.addRow([]);
  header(s1, [t.rank, t.id, t.name, t.group, t.variant, t.p1, t.p2, ...PARTS.map(p => p.startsWith('profile') ? `${t[p === 'profile1' ? 'p1' : 'p2']}, ${lang === 'kk' ? 'балл' : 'балл'}` : subjectName(p, lang)), t.total, t.pass, t.note]);
  for (const r of report.rows) {
    const notes = [r.edited ? t.manual : '', r.flags ? fmt(t.flags, { n: r.flags }) : '', r.duplicates ? fmt(t.dup, { n: r.duplicates + 1 }) : ''].filter(Boolean).join('; ');
    const row = s1.addRow([r.rank ?? '', r.id, r.name || t.noName, r.group, r.variant, r.creative ? t.creative : subjectName(r.profiles[0], lang), r.creative ? '' : subjectName(r.profiles[1], lang),
      ...PARTS.map(p => r.parts[p] ?? ''), r.total ?? '', r.pass === null ? t.unknown : r.pass ? t.yes : t.no, notes]);
    const passCell = row.getCell(14);
    passCell.fill = r.pass === true ? GREEN : r.pass === false ? RED : GREY;
    row.getCell(13).font = { bold: true };
  }
  s1.columns = [6, 7, 30, 9, 8, 20, 20, 9, 9, 9, 10, 10, 8, 12, 30].map(width => ({ width }));

  // группы — под итогами
  s1.addRow([]);
  const gTitle = s1.addRow([t.groups]); gTitle.font = { bold: true };
  header(s1, [t.group, t.count, t.passed, ...PARTS.map(p => p.startsWith('profile') ? t[p === 'profile1' ? 'p1' : 'p2'] : subjectName(p, lang)), `${t.avg} ${t.total.toLowerCase()}`]);
  for (const g of report.groups) s1.addRow([g.group, g.count, g.passed, ...PARTS.map(p => g.avg[p]), g.avgTotal]);

  // ---- Ответы ----
  const s2 = wb.addWorksheet(t.answers, { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
  const cols = PARTS.flatMap(p => Array.from({ length: COUNTS[p] }, (_, i) => ({ part: p, n: i + 1 })));
  header(s2, [t.id, t.name, t.variant, ...cols.map(c => `${SHORT[lang][c.part]}${c.n}`)]);
  s2.addRow([t.legend]).font = { italic: true, color: { argb: 'FF64748B' } };
  // строки ключей по вариантам (обязательные блоки — общие, профили — у каждого свои, поэтому только ИК/МГ/ГЧ)
  for (const v of Object.keys(test.keys ?? {}).sort()) {
    const k = test.keys[v];
    const row = s2.addRow([t.key, '', v, ...cols.map(c => (c.part.startsWith('profile') ? '' : k[c.part]?.[c.n]?.a ?? ''))]);
    row.font = { bold: true, color: { argb: 'FF0F766E' } };
  }
  for (const r of report.rows) {
    const vals = cols.map(c => r.answers?.[c.part]?.[c.n]?.marked ?? '');
    const row = s2.addRow([r.id, r.name || t.noName, r.variant, ...vals]);
    cols.forEach((c, i) => {
      const w = (r.wrong[c.part] ?? []).find(x => x.n === c.n);
      if (!w) return;
      const cell = row.getCell(4 + i);
      cell.fill = vals[i] ? RED : YELLOW;
      cell.note = `${t.key}: ${w.key}${w.points ? ` (${w.points}/2)` : ''}`;
    });
  }
  s2.columns = [{ width: 7 }, { width: 28 }, { width: 7 }, ...cols.map(() => ({ width: 5 }))];

  // ---- Анализ вопросов ----
  const s3 = wb.addWorksheet(t.analysis, { views: [{ state: 'frozen', ySplit: 1 }] });
  header(s3, [t.subject, t.variant, t.n, t.key, t.correctPct, t.avgPoints, t.commonWrong, t.topic, t.top10]);
  for (const q of report.questions) {
    const row = s3.addRow([subjectName(q.subject, lang), q.variant, q.n, q.key, q.correctPct, q.avgPoints,
      q.commonWrong ? `${q.commonWrong} (${q.commonWrongCount})` : '', q.topic, q.top10 ? '★' : '']);
    if (q.top10) row.eachCell(c => { c.fill = RED; });
    else if (q.correctPct < 50) row.getCell(5).fill = YELLOW;
  }
  s3.columns = [26, 8, 6, 8, 10, 12, 20, 30, 12].map(width => ({ width }));

  // ---- Динамика ----
  const s4 = wb.addWorksheet(t.dynamics, { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
  header(s4, [t.id, t.name, t.group, ...report.dynamics.tests.map(x => `${x.name} (${(x.date || '').split('-').reverse().join('.')})`), t.change]);
  for (const r of report.dynamics.rows) {
    const row = s4.addRow([r.id, r.name, r.group, ...r.totals.map(v => v ?? ''), r.change ?? '']);
    const ch = row.getCell(4 + r.totals.length);
    if (r.change > 0) ch.fill = GREEN; else if (r.change < 0) ch.fill = RED;
  }
  s4.columns = [{ width: 7 }, { width: 28 }, { width: 9 }, ...report.dynamics.tests.map(() => ({ width: 16 })), { width: 11 }];

  return wb;
}
