import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE, BUBBLE_R, MARKERS, ANSWER_SECTIONS, SUBJECT_BUBBLES, SUBJECT_ROWS, COMBO_BUBBLES, STUDENT_ID, VARIANT, allBubbles, SHEET_VERSION, VERSION_CODE, optionsForAnswer,
} from '../src/template.js';

test('бланк версии 5, код версии внизу совпадает', () => {
  assert.equal(SHEET_VERSION, 5);
  const bits = VERSION_CODE.cells.slice(1, 7).map(c => (c.filled ? '1' : '0')).join('');
  assert.equal(parseInt(bits, 2), 5);
});

test('в бланке 120 вопросов по блокам 20/10/10/40/40', () => {
  const counts = Object.fromEntries(ANSWER_SECTIONS.map(s => [s.key, s.questions.length]));
  assert.deepEqual(counts, { history: 20, mathLit: 10, reading: 10, profile1: 40, profile2: 40 });
});

test('кружки: обязательные A–E, профиль 1–30 A–D, 31–35 — два пункта по A–D, 36–40 A–F', () => {
  for (const s of ANSWER_SECTIONS) {
    for (const q of s.questions) {
      const letters = q.options.map(o => (o.item ? `${o.item}${o.letter}` : o.letter)).join('');
      const prof = s.key.startsWith('profile');
      const want = !prof ? 'ABCDE' : q.n <= 30 ? 'ABCD' : q.n <= 35 ? '1A1B1C1D2A2B2C2D' : 'ABCDEF';
      assert.equal(letters, want, `${s.key} №${q.n}`);
    }
  }
});

test('ответ сопоставления «AC» закрашивает 1)A и 2)C', () => {
  const q = ANSWER_SECTIONS.find(s => s.key === 'profile1').questions.find(q => q.n === 33);
  assert.deepEqual(optionsForAnswer(q, 'AC').map(o => `${o.item}${o.letter}`), ['1A', '2C']);
  assert.deepEqual(optionsForAnswer(q, '-D').map(o => `${o.item}${o.letter}`), ['2D']);
});

test('номера вопросов идут подряд с 1', () => {
  for (const s of ANSWER_SECTIONS) s.questions.forEach((q, i) => assert.equal(q.n, i + 1, s.key));
});

test('ID — 4 колонки, вариант — 2, комбинаций — 13 (12 пар + «Творчество»), v4 — 12 предметов', () => {
  assert.equal(STUDENT_ID.columns.length, 4);
  assert.equal(VARIANT.columns.length, 2);
  assert.equal(COMBO_BUBBLES.length, 13);
  assert.equal(COMBO_BUBBLES.at(-1).creative, true);
  assert.deepEqual(COMBO_BUBBLES[10].subjects, ['worldHistory', 'law']);
  assert.equal(SUBJECT_BUBBLES.length, 24, 'v4: у каждого предмета кружки «1» и «2»');
});

test('строки комбинаций выше блока инструкции', () => {
  for (const b of COMBO_BUBBLES) assert.ok(b.y + BUBBLE_R < 80 - 0.5, `строка ${b.index}`);
});

test('кружки не меньше 3,3 мм', () => {
  assert.ok(BUBBLE_R * 2 >= 3.3);
});

test('все кружки внутри прямоугольника угловых меток и выше подписи версии', () => {
  const minX = MARKERS[0].x + MARKERS[0].size, maxX = MARKERS[1].x;
  const minY = MARKERS[0].y + MARKERS[0].size;
  for (const b of allBubbles()) {
    assert.ok(b.x - BUBBLE_R > minX && b.x + BUBBLE_R < maxX, `x ${b.group} ${b.x}`);
    assert.ok(b.y - BUBBLE_R > minY && b.y + BUBBLE_R < VERSION_CODE.textY - 2.5, `y ${b.group} ${b.y}`);
    assert.ok(b.x > 0 && b.x < PAGE.w);
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

test('профили не залезают друг на друга: правая часть профиля 1 левее профиля 2', () => {
  const maxX = key => Math.max(...ANSWER_SECTIONS.find(s => s.key === key).questions.filter(q => q.n > 20).flatMap(q => q.options.map(o => o.x)));
  const minX = key => Math.min(...ANSWER_SECTIONS.find(s => s.key === key).questions.filter(q => q.n > 20).flatMap(q => q.options.map(o => o.x)));
  assert.ok(maxX('profile1') + BUBBLE_R + 3 < minX('profile2') - 10, `${maxX('profile1')} / ${minX('profile2')}`);
});

test('кружки «1» и «2» у предметов не налезают друг на друга и на подписи', () => {
  for (const r of SUBJECT_ROWS) {
    const [a, b] = r.options;
    assert.ok(b.x - a.x >= BUBBLE_R * 2 + 1, 'промежуток между «1» и «2»');
    assert.ok(r.labelX - b.x >= BUBBLE_R + 1, 'подпись правее кружка «2»');
  }
});
