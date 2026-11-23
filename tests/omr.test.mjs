import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognize } from '../src/omr.js';
import { synthPhoto, buildMarks, randomAnswers, rng } from './synth.mjs';

function expectSame(res, answers, label) {
  assert.ok(res.ok, `${label}: не распознан (${res.error})`);
  for (const [sec, qs] of Object.entries(res.answers)) {
    for (const [n, a] of Object.entries(qs)) {
      const want = answers[sec]?.[n] ?? '';
      assert.equal(a.status === 'check' ? '?' : a.marked, want, `${label}: ${sec} №${n} (оценки ${a.scores})`);
    }
  }
}

test('10 случайных бланков с перспективой, тенью и шумом читаются без ошибок', () => {
  const times = [];
  for (let seed = 1; seed <= 10; seed++) {
    const R = rng(seed * 7);
    const answers = randomAnswers(R);
    const id = String(1 + ((R() * 9998) | 0)).padStart(4, '0');
    const variant = R() < 0.5 ? '01' : '02';
    const subjects = [(R() * 6) | 0, 6 + ((R() * 6) | 0)];
    const img = synthPhoto({ marks: buildMarks({ id, variant, subjects, answers }), seed });
    const res = recognize(img);
    times.push(res.ms);
    expectSame(res, answers, `бланк ${seed}`);
    assert.equal(res.studentId, id);
    assert.equal(res.variant, variant);
    assert.equal(res.subjects.length, 2);
    assert.equal(res.flags.length, 0, JSON.stringify(res.flags));
  }
  console.log('время распознавания, мс:', times.join(', '));
});

test('бланк повёрнут на 90° и вверх ногами', () => {
  for (const orient of ['landscape', 'upside']) {
    const answers = randomAnswers(rng(99));
    const img = synthPhoto({ marks: buildMarks({ id: '0427', variant: '02', answers }), seed: 5, orient });
    const res = recognize(img);
    expectSame(res, answers, orient);
    assert.equal(res.studentId, '0427');
  }
});

test('синяя ручка и неаккуратная заливка засчитываются', () => {
  const answers = { history: { 1: 'A', 2: 'B' }, profile1: { 33: 'ACE' } };
  const style = { 'history:1:A': 'blue', 'history:2:B': 'messy', 'profile1:33:C': 'blue' };
  const res = recognize(synthPhoto({ marks: buildMarks({ answers, style }), seed: 3 }));
  assert.equal(res.answers.history[1].marked, 'A');
  assert.equal(res.answers.history[2].marked, 'B');
  assert.equal(res.answers.profile1[33].marked, 'ACE');
  assert.equal(res.flags.length, 0, JSON.stringify(res.flags));
});

test('сомнительные отметки подсвечиваются, а не засчитываются молча', () => {
  const answers = {
    history: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'AB' },
    mathLit: { 1: 'E' },
  };
  const style = {
    'history:1:A': 'x', 'history:2:B': 'check', 'history:3:C': 'half', 'history:4:D': 'light',
    'mathLit:1:E': 'dot',
  };
  const res = recognize(synthPhoto({ marks: buildMarks({ answers, style }), seed: 4 }));
  const flagged = new Set(res.flags.filter(f => f.kind === 'answer').map(f => `${f.section}:${f.n}`));
  for (const q of ['history:1', 'history:2', 'history:3', 'history:4', 'history:5']) {
    assert.ok(flagged.has(q), `${q} должен быть подсвечен; оценки ${res.answers[q.split(':')[0]][q.split(':')[1]].scores}`);
  }
  // точка внутри кружка — не ответ, но и не ложное «закрашено»
  assert.notEqual(res.answers.mathLit[1].marked, 'E');
});

test('ошибки в ID и предметах подсвечиваются', () => {
  const marks = buildMarks({ id: '0012', subjects: [0, 1, 2] });
  const res = recognize(synthPhoto({ marks, seed: 8 }));
  assert.ok(res.flags.some(f => f.kind === 'subjects'), 'три предмета');
  const noId = recognize(synthPhoto({ marks: buildMarks({ id: '0012' }).slice(1), seed: 9 }));
  assert.equal(noId.studentId, null);
  assert.ok(noId.flags.some(f => f.kind === 'id'));
});

test('без бланка в кадре — понятная ошибка, а не мусор', () => {
  const w = 600, h = 800, gray = new Uint8Array(w * h).fill(120);
  const res = recognize({ width: w, height: h, gray });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'markers');
});
