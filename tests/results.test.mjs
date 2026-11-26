import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effective, evaluate, mergeEdits } from '../src/results.js';

function rec(over = {}) {
  const answers = { history: {}, mathLit: {}, reading: {}, profile1: {}, profile2: {} };
  for (let n = 1; n <= 20; n++) answers.history[n] = { marked: 'A', weak: '', status: 'ok', scores: [] };
  for (let n = 1; n <= 10; n++) { answers.mathLit[n] = { marked: 'B', weak: '', status: 'ok', scores: [] }; answers.reading[n] = { marked: 'C', weak: '', status: 'ok', scores: [] }; }
  for (const s of ['profile1', 'profile2']) for (let n = 1; n <= 40; n++) answers[s][n] = { marked: n >= 31 ? 'AB' : 'D', weak: '', status: 'ok', scores: [] };
  answers.history[5] = { marked: 'AC', weak: '', status: 'check', scores: [] };
  return {
    id: 'r1', ok: true, studentId: null, studentIdRaw: '00?1', variant: '01', variantRaw: '01',
    subjects: ['math', 'physics'], answers,
    flags: [{ kind: 'answer', section: 'history', n: 5, reason: 'multiple', letters: 'AC' }, { kind: 'id', column: 2, reason: 'empty' }],
    ...over,
  };
}
function key() {
  const k = { history: {}, mathLit: {}, reading: {}, subjects: { math: {}, physics: {} } };
  for (let n = 1; n <= 20; n++) k.history[n] = { a: 'A' };
  for (let n = 1; n <= 10; n++) { k.mathLit[n] = { a: 'B' }; k.reading[n] = { a: 'C' }; }
  for (const s of ['math', 'physics']) for (let n = 1; n <= 40; n++) k.subjects[s][n] = { a: n >= 31 ? 'AB' : 'D' };
  return k;
}
const ctx = (results, students = [{ id: '0001', name: 'Әлібеков Нұрлан' }]) => ({ test: { keys: { '01': key() } }, students, results });

test('без исправлений: флаги на месте, двойной ответ — 0 баллов', () => {
  const r = rec();
  const ev = evaluate(r, ctx([r]));
  assert.equal(ev.state, 'check');
  assert.deepEqual(ev.flags.map(f => f.kind).sort(), ['answer', 'id']);
  assert.equal(ev.score.total, 139);
});

test('исправление ответа и ID снимает предупреждения и меняет балл', () => {
  const r = rec({ edits: { studentId: '0001', answers: { history: { 5: 'A' } } } });
  const ev = evaluate(r, ctx([r]));
  assert.equal(ev.state, 'ok', JSON.stringify(ev.flags));
  assert.equal(ev.student.name, 'Әлібеков Нұрлан');
  assert.equal(ev.score.total, 140);
  assert.equal(ev.eff.answers.history[5].edited, true);
});

test('исправленный ID, которого нет в списке — предупреждение «неизвестный ученик»', () => {
  const r = rec({ edits: { studentId: '0999', answers: { history: { 5: '' } } } });
  const ev = evaluate(r, ctx([r]));
  assert.deepEqual(ev.flags.map(f => f.kind), ['unknownStudent']);
  assert.equal(ev.eff.answers.history[5].status, 'empty');
});

test('дубль ID считается по исправленным значениям', () => {
  const a = rec({ id: 'a', edits: { studentId: '0001', answers: { history: { 5: 'A' } } } });
  const b = rec({ id: 'b', studentId: '0001', studentIdRaw: '0001', flags: [] });
  const ev = evaluate(a, ctx([a, b]));
  assert.deepEqual(ev.flags.map(f => f.kind), ['duplicate']);
  assert.deepEqual(ev.flags[0].others, ['b']);
});

test('смена предметов меняет профили, смена варианта без ключа — предупреждение', () => {
  const r = rec({ flags: [{ kind: 'subjects', count: 3, reason: 'count' }], edits: { studentId: '0001', subjects: ['physics', 'math'], variant: '02', answers: { history: { 5: 'A' } } } });
  const ev = evaluate(r, ctx([r]));
  assert.deepEqual(ev.profiles, ['physics', 'math'], 'порядок, выбранный оператором, сохраняется');
  assert.deepEqual(ev.flags.map(f => f.kind), ['noKeyVariant']);
  assert.equal(ev.score, null);
});

test('бланк v4: порядок профилей берётся с бланка, а не из настроек', () => {
  const v4 = rec({ subjects: ['physics', 'math'], subjectsOrdered: true });
  assert.deepEqual(evaluate(v4, ctx([v4])).profiles, ['physics', 'math']);
  const v3 = rec({ subjects: ['physics', 'math'] });
  assert.deepEqual(evaluate(v3, ctx([v3])).profiles, ['math', 'physics'], 'v3 — по списку предметов');
  assert.deepEqual(evaluate(v3, { ...ctx([v3]), combos: [['physics', 'math']] }).profiles, ['physics', 'math'], 'v3 — по парам из настроек');
});

test('слияние исправлений не теряет прошлые правки', () => {
  const m = mergeEdits({ studentId: '0001', answers: { history: { 5: 'A' } } }, { answers: { history: { 6: 'B' }, reading: { 1: '' } } });
  assert.deepEqual(m, { studentId: '0001', answers: { history: { 5: 'A', 6: 'B' }, reading: { 1: '' } } });
  assert.equal(effective(rec({ edits: m })).answers.reading[1].marked, '');
});
