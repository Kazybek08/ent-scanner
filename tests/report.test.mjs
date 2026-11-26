import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { buildReport, passInfo, DEFAULT_THRESHOLDS } from '../src/report.js';
import { buildWorkbook } from '../src/export-xlsx.js';

function key(seed = 0) {
  const k = { history: {}, mathLit: {}, reading: {}, subjects: { math: {}, physics: {} } };
  for (let n = 1; n <= 20; n++) k.history[n] = { a: 'ABCDE'[(n + seed) % 5], topic: n === 3 ? 'Казахское ханство' : '' };
  for (let n = 1; n <= 10; n++) { k.mathLit[n] = { a: 'B' }; k.reading[n] = { a: 'C' }; }
  for (const s of ['math', 'physics']) for (let n = 1; n <= 40; n++) k.subjects[s][n] = { a: n >= 31 ? 'AB' : 'D' };
  return k;
}
// бланк, где ученик ошибся в `wrong` вопросах истории и ничего не ответил в `blank` вопросах чтения
function sheet(id, studentId, k, { wrong = 0, blank = 0, createdAt = 1, edits } = {}) {
  const answers = { history: {}, mathLit: {}, reading: {}, profile1: {}, profile2: {} };
  for (let n = 1; n <= 20; n++) { const a = k.history[n].a; answers.history[n] = { marked: n <= wrong ? (a === 'A' ? 'B' : 'A') : a, weak: '', status: 'ok', scores: [] }; }
  for (let n = 1; n <= 10; n++) { answers.mathLit[n] = { marked: 'B', weak: '', status: 'ok', scores: [] }; answers.reading[n] = { marked: n <= blank ? '' : 'C', weak: '', status: 'ok', scores: [] }; }
  for (const s of ['profile1', 'profile2']) for (let n = 1; n <= 40; n++) answers[s][n] = { marked: n >= 31 ? 'AB' : 'D', weak: '', status: 'ok', scores: [] };
  return { id, ok: true, testId: 't1', createdAt, studentId, studentIdRaw: studentId, variant: '01', variantRaw: '01', subjects: ['math', 'physics'], answers, flags: [], edits };
}

const students = [
  { id: '0001', name: 'Әлібеков Нұрлан', group: '11А' },
  { id: '0002', name: 'Иванова Анна', group: '11А' },
  { id: '0003', name: 'Петров Илья', group: '11Б' },
];

test('порог: общий балл и минимумы по предметам', () => {
  const sc = { complete: true, total: 60, parts: { history: { points: 4 }, mathLit: { points: 5 }, reading: { points: 5 }, profile1: { points: 20 }, profile2: { points: 26 } } };
  assert.deepEqual(passInfo(sc, DEFAULT_THRESHOLDS), { pass: false, fails: ['history'] });
  sc.parts.history.points = 5;
  assert.equal(passInfo(sc).pass, true);
  assert.equal(passInfo({ complete: false }).pass, null, 'неполный балл — порог не решаем');
});

test('рейтинг, одинаковые места, последний скан ученика, средние по группам', () => {
  const k = key();
  const test1 = { id: 't1', name: 'Ноябрь', date: '2026-11-28', keys: { '01': k } };
  const results = [
    sheet('a', '0001', k, { wrong: 2, createdAt: 1 }),      // 138
    sheet('b', '0002', k, { wrong: 2, createdAt: 2 }),      // 138 — делит 1-е место
    sheet('c', '0003', k, { wrong: 5, blank: 3, createdAt: 3 }),   // 132
    sheet('d', '0003', k, { wrong: 1, createdAt: 0 }),      // старый скан Петрова — не считается
  ];
  const r = buildReport({ test: test1, students, results });
  assert.deepEqual(r.rows.map(x => [x.id, x.total, x.rank]), [['0001', 138, 1], ['0002', 138, 1], ['0003', 132, 3]]);
  assert.equal(r.rows.find(x => x.id === '0003').duplicates, 1);
  assert.equal(r.summary.passed, 3);
  assert.deepEqual(r.groups.map(g => [g.group, g.count, g.avgTotal]), [['11А', 2, 138], ['11Б', 1, 132]]);
});

test('анализ вопросов: процент верных, частый неверный ответ, тема', () => {
  const k = key();
  const test1 = { id: 't1', name: 'Ноябрь', date: '2026-11-28', keys: { '01': k } };
  const results = [sheet('a', '0001', k, { wrong: 3 }), sheet('b', '0002', k, { wrong: 3 }), sheet('c', '0003', k, { wrong: 1 })];
  const q = buildReport({ test: test1, students, results }).questions;
  const h3 = q.find(x => x.subject === 'history' && x.n === 3);
  assert.equal(h3.correctPct, 33, 'двое из трёх ошиблись');
  assert.equal(h3.topic, 'Казахское ханство');
  assert.equal(h3.commonWrongCount, 2);
  assert.equal(q.find(x => x.subject === 'history' && x.n === 1).correctPct, 0);
  assert.equal(q.find(x => x.subject === 'history' && x.n === 4).correctPct, 100);
  assert.ok(q.filter(x => x.top10).length <= 10);
});

test('динамика по двум пробникам', () => {
  const k = key();
  const t1 = { id: 't1', name: 'Октябрь', date: '2026-10-30', createdAt: 1, keys: { '01': k } };
  const t2 = { id: 't2', name: 'Ноябрь', date: '2026-11-28', createdAt: 2, keys: { '01': k } };
  const r1 = [sheet('a', '0001', k, { wrong: 6 })];
  const r2 = [sheet('b', '0001', k, { wrong: 1 }), sheet('c', '0002', k, {})];
  const rep = buildReport({ test: t2, students, results: r2, history: [{ test: t2, results: r2 }, { test: t1, results: r1 }] });
  assert.deepEqual(rep.dynamics.tests.map(x => x.name), ['Октябрь', 'Ноябрь']);
  const a = rep.dynamics.rows.find(x => x.id === '0001');
  assert.deepEqual(a.totals, [134, 139]);
  assert.equal(a.change, 5);
  assert.equal(rep.dynamics.rows.find(x => x.id === '0002').change, null);
});

test('Excel: 4 листа, ошибки красным, пустые жёлтым, открывается обратно', async () => {
  const k = key();
  const test1 = { id: 't1', name: 'Ноябрь', date: '2026-11-28', keys: { '01': k } };
  const results = [sheet('a', '0001', k, { wrong: 2, blank: 1 }), sheet('b', '0002', k, {})];
  const report = buildReport({ test: test1, students, results, history: [{ test: test1, results }] });
  for (const lang of ['ru', 'kk']) {
    const wb = buildWorkbook(ExcelJS, report, { test: test1, lang });
    const buf = await wb.xlsx.writeBuffer();
    // читается другой библиотекой — значит, файл корректный
    const back = XLSX.read(buf, { type: 'buffer' });
    assert.equal(back.SheetNames.length, 4);
    const ans = XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[1]], { header: 1 });
    const row = ans.find(r => r[0] === '0001');
    assert.equal(row[3], k.history[1].a === 'A' ? 'B' : 'A');
    // цвета
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);
    const ws = wb2.worksheets[1];
    let r0001;
    ws.eachRow(r => { if (r.getCell(1).value === '0001') r0001 = r; });
    assert.equal(r0001.getCell(4).fill.fgColor.argb, 'FFFCA5A5', 'неверный ответ — красный');
    assert.equal(r0001.getCell(4 + 30).fill.fgColor.argb, 'FFFEF08A', 'пустой ответ (чтение №1) — жёлтый');
    assert.equal(r0001.getCell(6).fill, undefined, 'верный ответ без заливки');
  }
});

test('«Творчество»: отдельный рейтинг из 30, без общего порога, не входит в средние', () => {
  const k = key();
  const test1 = { id: 't1', name: 'Ноябрь', date: '2026-11-28', keys: { '01': k } };
  const cr = (id, sid, wrong) => ({ ...sheet(id, sid, k, { wrong }), subjects: [], creative: true });
  const results = [sheet('a', '0001', k, { wrong: 2 }), cr('b', '0002', 0), cr('c', '0003', 18)];
  const r = buildReport({ test: test1, students, results });
  assert.deepEqual(r.rows.map(x => [x.id, x.total, x.rank, x.creative, x.max]),
    [['0001', 138, 1, false, 140], ['0002', 30, 1, true, 30], ['0003', 12, 2, true, 30]]);
  assert.equal(r.rows[1].pass, true, 'общий порог 50 к «Творчеству» не применяется');
  assert.equal(r.rows[2].pass, false, 'история 2 < минимума 5');
  assert.deepEqual(r.rows[2].fails, ['history']);
  assert.equal(r.summary.complete, 1);
  assert.deepEqual(r.summary.creative, { count: 2, passed: 1, avgTotal: 21 });
  assert.deepEqual(r.groups.map(g => [g.group, g.count]), [['11А', 1]]);
  assert.ok(!r.questions.some(q => q.part === 'mathLit' && q.answered > 1), 'математическая грамотность творческих не считается');
});
