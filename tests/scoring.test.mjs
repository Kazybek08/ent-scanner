import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreQuestion, scoreSheet, orderProfiles, isMulti, questionType, maxFor } from '../src/scoring.js';

test('обычный вопрос: 1 балл только за ровно один верный кружок', () => {
  assert.equal(scoreQuestion('C', 'C', 'single'), 1);
  assert.equal(scoreQuestion('A', 'C', 'single'), 0);
  assert.equal(scoreQuestion('', 'C', 'single5'), 0, 'пусто — 0');
  assert.equal(scoreQuestion('AC', 'C', 'single'), 0, 'два кружка — 0, даже если один верный');
  assert.equal(scoreQuestion('C', undefined, 'single'), null, 'нет ключа');
});

test('сопоставление 31–35: балл за каждую верную пару', () => {
  assert.equal(scoreQuestion('AC', 'AC', 'match'), 2, 'обе пары');
  assert.equal(scoreQuestion('AD', 'AC', 'match'), 1, 'первая пара');
  assert.equal(scoreQuestion('-C', 'AC', 'match'), 1, 'первая пустая, вторая верна');
  assert.equal(scoreQuestion('CA', 'AC', 'match'), 0, 'порядок важен: пункты перепутаны');
  assert.equal(scoreQuestion('--', 'AC', 'match'), 0);
  assert.equal(scoreQuestion('', 'AC', 'match'), 0);
  assert.equal(scoreQuestion('BB', 'BB', 'match'), 2, 'один вариант может подходить обоим пунктам');
});

test('вопросы 36–40: 2 / 1 / 0', () => {
  assert.equal(scoreQuestion('ACE', 'ACE', 'multi'), 2, 'полностью верно');
  assert.equal(scoreQuestion('ECA', 'ACE', 'multi'), 2, 'порядок букв не важен');
  assert.equal(scoreQuestion('AC', 'ACE', 'multi'), 1, 'один пропущенный');
  assert.equal(scoreQuestion('ACEF', 'ACE', 'multi'), 1, 'один лишний');
  assert.equal(scoreQuestion('A', 'ACE', 'multi'), 0, 'два пропущенных');
  assert.equal(scoreQuestion('ACF', 'ACE', 'multi'), 0, 'один лишний и один пропущенный = две ошибки');
  assert.equal(scoreQuestion('', 'ACE', 'multi'), 0, 'пусто — 0');
  assert.equal(scoreQuestion('BD', 'B', 'multi'), 1, 'при одном верном — один лишний');
});

test('типы вопросов профильного предмета', () => {
  assert.equal(questionType('history', 20), 'single5');
  assert.equal(questionType('profile1', 1), 'single');
  assert.equal(questionType('profile1', 30), 'single');
  assert.equal(questionType('profile2', 31), 'match');
  assert.equal(questionType('profile2', 35), 'match');
  assert.equal(questionType('profile1', 36), 'multi');
  assert.equal(isMulti('profile1', 40), true);
  assert.equal(isMulti('profile1', 33), false);
  assert.equal(maxFor('profile1', 33), 2);
  assert.equal(maxFor('profile1', 12), 1);
});

function fullKey() {
  const k = { history: {}, mathLit: {}, reading: {}, subjects: { math: {}, physics: {} } };
  for (let n = 1; n <= 20; n++) k.history[n] = { a: 'A' };
  for (let n = 1; n <= 10; n++) { k.mathLit[n] = { a: 'B' }; k.reading[n] = { a: 'C' }; }
  for (const s of ['math', 'physics']) for (let n = 1; n <= 40; n++) {
    k.subjects[s][n] = { a: n >= 36 ? 'AB' : n >= 31 ? 'CA' : 'D', topic: n === 5 ? 'Логарифмы' : '' };
  }
  return k;
}
function perfectAnswers() {
  const a = { history: {}, mathLit: {}, reading: {}, profile1: {}, profile2: {} };
  for (let n = 1; n <= 20; n++) a.history[n] = 'A';
  for (let n = 1; n <= 10; n++) { a.mathLit[n] = 'B'; a.reading[n] = 'C'; }
  for (const s of ['profile1', 'profile2']) for (let n = 1; n <= 40; n++) a[s][n] = n >= 36 ? 'AB' : n >= 31 ? 'CA' : 'D';
  return a;
}

test('идеальный бланк — 140 из 140', () => {
  const r = scoreSheet({ answers: perfectAnswers(), profiles: ['math', 'physics'], key: fullKey() });
  assert.equal(r.total, 140);
  assert.equal(r.max, 140);
  assert.equal(r.complete, true);
  assert.deepEqual(Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, v.points])),
    { history: 20, mathLit: 10, reading: 10, profile1: 50, profile2: 50 });
});

test('ошибки снижают балл как положено и попадают в список ошибок с темой', () => {
  const a = perfectAnswers();
  a.history[1] = 'B';            // −1
  a.history[2] = '';             // −1
  a.profile1[5] = 'AD';          // два кружка — −1
  a.profile1[31] = 'CB';         // сопоставление: одна пара — 1 из 2
  a.profile1[37] = 'A';          // одна ошибка — 1 из 2
  a.profile2[40] = 'CD';         // мимо — 0 из 2
  const r = scoreSheet({ answers: a, profiles: ['math', 'physics'], key: fullKey() });
  assert.equal(r.total, 140 - 1 - 1 - 1 - 1 - 1 - 2);
  assert.equal(r.parts.history.points, 18);
  assert.equal(r.parts.profile1.points, 47);
  assert.equal(r.parts.profile2.points, 48);
  assert.equal(r.parts.profile1.wrong.find(x => x.n === 5).topic, 'Логарифмы');
  assert.deepEqual(r.parts.profile1.wrong.find(x => x.n === 31), { n: 31, marked: 'CB', key: 'CA', points: 1, max: 2, type: 'match', topic: '' });
});

test('нет ключа по предмету — балл неполный, а не ноль', () => {
  const key = fullKey();
  delete key.subjects.physics;
  const r = scoreSheet({ answers: perfectAnswers(), profiles: ['math', 'physics'], key });
  assert.equal(r.complete, false);
  assert.equal(r.parts.profile2.points, null);
  assert.deepEqual(r.missing, ['profile2:physics']);
  assert.equal(r.total, 90);
});

test('порядок профилей: по комбинациям из настроек, иначе по списку предметов', () => {
  assert.deepEqual(orderProfiles(['physics', 'math']), ['math', 'physics']);
  assert.deepEqual(orderProfiles(['chemistry', 'biology'], [['biology', 'chemistry']]), ['biology', 'chemistry']);
  assert.equal(orderProfiles(['math']), null);
});

test('«Творчество»: только история и чтение, максимум 30, без профилей балл полный', () => {
  const r = scoreSheet({ answers: perfectAnswers(), profiles: null, key: fullKey(), creative: true });
  assert.equal(r.total, 30);
  assert.equal(r.max, 30);
  assert.equal(r.fullMax, 30);
  assert.equal(r.complete, true, 'нет профилей — это не «неполный» бланк');
  assert.deepEqual(r.missing, []);
  assert.equal(r.parts.mathLit.points, null);
  assert.equal(r.parts.mathLit.skipped, true);
  assert.equal(r.parts.profile1.skipped, true);
});
