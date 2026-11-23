import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE, BUBBLE_R, MARKERS, ANSWER_SECTIONS, SUBJECT_BUBBLES, STUDENT_ID, VARIANT, allBubbles,
} from '../src/template.js';

test('в бланке 120 вопросов по блокам 20/10/10/40/40', () => {
  const counts = Object.fromEntries(ANSWER_SECTIONS.map(s => [s.key, s.questions.length]));
  assert.deepEqual(counts, { history: 20, mathLit: 10, reading: 10, profile1: 40, profile2: 40 });
  const total = ANSWER_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
  assert.equal(total, 120);
});

test('вопросы 31–40 профиля имеют варианты A–F, остальные A–E', () => {
  for (const s of ANSWER_SECTIONS) {
    for (const q of s.questions) {
      const letters = q.options.map(o => o.letter).join('');
      const six = s.key.startsWith('profile') && q.n >= 31;
      assert.equal(letters, six ? 'ABCDEF' : 'ABCDE', `${s.key} №${q.n}`);
    }
  }
});

test('номера вопросов идут подряд с 1', () => {
  for (const s of ANSWER_SECTIONS) {
    s.questions.forEach((q, i) => assert.equal(q.n, i + 1, s.key));
  }
});

test('ID — 4 колонки, вариант — 2, предметов — 12', () => {
  assert.equal(STUDENT_ID.columns.length, 4);
  assert.equal(VARIANT.columns.length, 2);
  assert.equal(SUBJECT_BUBBLES.length, 12);
});

test('кружки не меньше 3,3 мм', () => {
  assert.ok(BUBBLE_R * 2 >= 3.3);
});

test('все кружки внутри прямоугольника угловых меток', () => {
  const minX = MARKERS[0].x + MARKERS[0].size, maxX = MARKERS[1].x;
  const minY = MARKERS[0].y + MARKERS[0].size, maxY = MARKERS[2].y;
  for (const b of allBubbles()) {
    assert.ok(b.x - BUBBLE_R > minX && b.x + BUBBLE_R < maxX, `x ${b.group} ${b.x}`);
    assert.ok(b.y - BUBBLE_R > minY && b.y + BUBBLE_R < maxY, `y ${b.group} ${b.y}`);
    assert.ok(b.x > 0 && b.x < PAGE.w && b.y > 0 && b.y < PAGE.h);
  }
});

test('кружки не касаются друг друга (зазор ≥ 0,6 мм)', () => {
  const list = allBubbles();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
      assert.ok(d >= 2 * BUBBLE_R + 0.6, `${list[i].group} и ${list[j].group}: ${d.toFixed(2)} мм`);
    }
  }
});
