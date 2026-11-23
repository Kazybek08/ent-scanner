import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreQuestion, scoreSheet, orderProfiles, isMulti } from '../src/scoring.js';

test('обычный вопрос: 1 балл только за ровно один верный кружок', () => {
  assert.equal(scoreQuestion('C', 'C', false), 1);
  assert.equal(scoreQuestion('A', 'C', false), 0);
  assert.equal(scoreQuestion('', 'C', false), 0, 'пусто — 0');
  assert.equal(scoreQuestion('AC', 'C', false), 0, 'два кружка — 0, даже если один верный');
  assert.equal(scoreQuestion('C', undefined, false), null, 'нет ключа');
});

test('вопросы 31–40: 2 / 1 / 0', () => {
  assert.equal(scoreQuestion('ACE', 'ACE', true), 2, 'полностью верно');
  assert.equal(scoreQuestion('ECA', 'ACE', true), 2, 'порядок букв не важен');
  assert.equal(scoreQuestion('AC', 'ACE', true), 1, 'один пропущенный');
  assert.equal(scoreQuestion('ACEF', 'ACE', true), 1, 'один лишний');
  assert.equal(scoreQuestion('A', 'ACE', true), 0, 'два пропущенных');
  assert.equal(scoreQuestion('ACF', 'ACE', true), 0, 'один лишний и один пропущенный = две ошибки');
  assert.equal(scoreQuestion('', 'ACE', true), 0, 'пусто — 0');
  assert.equal(scoreQuestion('B', 'B', true), 2, 'один верный ответ из одного');
  assert.equal(scoreQuestion('BD', 'B', true), 1, 'при одном верном — один лишний');
  assert.equal(scoreQuestion('', 'B', true), 0, 'пусто при одном верном — 0, а не 1');
});

test('какие вопросы многовариантные', () => {
  assert.equal(isMulti('profile1', 31), true);
  assert.equal(isMulti('profile2', 40), true);
  assert.equal(isMulti('profile1', 30), false);
  assert.equal(isMulti('history', 20), false);
});

function fullKey() {
  const k = { history: {}, mathLit: {}, reading: {}, subjects: { math: {}, physics: {} } };
  for (let n = 1; n <= 20; n++) k.history[n] = { a: 'A' };
  for (let n = 1; n <= 10; n++) { k.mathLit[n] = { a: 'B' }; k.reading[n] = { a: 'C' }; }
  for (const s of ['math', 'physics']) for (let n = 1; n <= 40; n++) k.subjects[s][n] = { a: n >= 31 ? 'AB' : 'D', topic: n === 5 ? 'Логарифмы' : '' };
  return k;
}
function perfectAnswers() {
  const a = { history: {}, mathLit: {}, reading: {}, profile1: {}, profile2: {} };
  for (let n = 1; n <= 20; n++) a.history[n] = 'A';
  for (let n = 1; n <= 10; n++) { a.mathLit[n] = 'B'; a.reading[n] = 'C'; }
  for (const s of ['profile1', 'profile2']) for (let n = 1; n <= 40; n++) a[s][n] = n >= 31 ? 'AB' : 'D';
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
  a.profile1[31] = 'A';          // одна ошибка — 1 из 2
  a.profile2[40] = 'CD';         // мимо — 0 из 2
  const r = scoreSheet({ answers: a, profiles: ['math', 'physics'], key: fullKey() });
  assert.equal(r.total, 140 - 1 - 1 - 1 - 1 - 2);
  assert.equal(r.parts.history.points, 18);
  assert.equal(r.parts.profile1.points, 48);
  assert.equal(r.parts.profile2.points, 48);
  const w = r.parts.profile1.wrong.find(x => x.n === 5);
  assert.equal(w.topic, 'Логарифмы');
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
