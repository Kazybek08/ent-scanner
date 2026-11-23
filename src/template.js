// ЕДИНЫЙ ШАБЛОН БЛАНКА v2.
// Все координаты — в миллиметрах от левого верхнего угла листа A4.
// По этому файлу строится PDF для печати И идёт распознавание фото.
// Если что-то двигаете на бланке — меняйте только здесь.

import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';

export const SHEET_VERSION = 2;
export const PAGE = { w: 210, h: 297 };

export const BUBBLE_R = 1.8;        // радиус кружка: диаметр 3,6 мм (ТЗ: не меньше 3,3)
export const ROW_PITCH = 4.6;       // шаг строк с вопросами
export const OPT_PITCH = 5.4;       // шаг кружков A–F внутри строки

// Угловые метки 6×6 мм. x, y — левый верхний угол квадрата.
export const MARKER_SIZE = 6;
export const MARKERS = [
  { id: 'tl', x: 8,   y: 8 },
  { id: 'tr', x: 196, y: 8 },
  { id: 'bl', x: 8,   y: 283 },
  { id: 'br', x: 196, y: 283 },
].map(m => ({ ...m, size: MARKER_SIZE, cx: m.x + MARKER_SIZE / 2, cy: m.y + MARKER_SIZE / 2 }));

// Рабочая область между метками.
const LEFT = 17;
const COL_W = 44;                   // 4 колонки ответов × 44 мм = 176 мм (17…193)

// ---------- ID ученика и вариант ----------
const DIGIT_TOP = 61;               // центр кружка «0»
const DIGIT_PITCH = 4.4;
const BOX = { w: 5, h: 6, pitch: 6, top: 51 };

function digitColumns(x0, count) {
  const cols = [];
  for (let i = 0; i < count; i++) {
    const cx = x0 + BOX.w / 2 + i * BOX.pitch;
    const col = [];
    for (let d = 0; d <= 9; d++) col.push({ value: d, x: cx, y: DIGIT_TOP + d * DIGIT_PITCH });
    cols.push({ box: { x: x0 + i * BOX.pitch, y: BOX.top, w: BOX.w, h: BOX.h }, bubbles: col });
  }
  return cols;
}

export const STUDENT_ID = { x: LEFT, labelY: 46.5, columns: digitColumns(LEFT, 4) };
export const VARIANT    = { x: 47,   labelY: 46.5, columns: digitColumns(47, 2) };

// ---------- Профильные предметы ----------
const SUBJ = { x0: 68.5, x1: 130.5, top: 55, pitch: 4.4 };
export const SUBJECTS_AREA = { x: 66, labelY: 46.5, right: 193 };
export const SUBJECT_BUBBLES = DEFAULT_SUBJECTS.map((s, i) => ({
  index: i,
  code: s.code,
  x: i < 6 ? SUBJ.x0 : SUBJ.x1,
  y: SUBJ.top + (i % 6) * SUBJ.pitch,
}));

// ---------- Блок инструкции ----------
export const INSTRUCTION_BOX = { x: 66, y: 80, w: 127, h: 24 };

// ---------- Ответы ----------
const UPPER = { headerY: 108, firstRow: 115 };
const LOWER = { headerY: 217, firstRow: 225 };

function questionRows({ x0, firstRow, startSlot, from, to, letters }) {
  const rows = [];
  for (let n = from; n <= to; n++) {
    const y = firstRow + (startSlot + n - from) * ROW_PITCH;
    rows.push({
      n,
      numberX: x0 + 6.5,             // правый край номера вопроса
      y,
      options: [...letters].map((letter, j) => ({ letter, x: x0 + 10 + j * OPT_PITCH, y })),
    });
  }
  return rows;
}

const colX = c => LEFT + c * COL_W;
const ABCDE = 'ABCDE';
const ABCDEF = 'ABCDEF';

// Заголовки блоков (для рисования) — где и что написано.
export const ANSWER_HEADERS = [
  { section: 'history',  x: colX(0), y: UPPER.headerY, w: COL_W },
  { section: 'mathLit',  x: colX(1), y: UPPER.headerY, w: COL_W },
  { section: 'reading',  x: colX(1), y: UPPER.firstRow + 10 * ROW_PITCH + 2.3, w: COL_W },
  { section: 'profile1', x: colX(2), y: UPPER.headerY, w: COL_W, range: '1–20' },
  { section: 'profile2', x: colX(3), y: UPPER.headerY, w: COL_W, range: '1–20' },
  { section: 'profile1', x: colX(0), y: LOWER.headerY, w: COL_W * 2, range: '21–40' },
  { section: 'profile2', x: colX(2), y: LOWER.headerY, w: COL_W * 2, range: '21–40' },
];

const up = (c, from, to, startSlot = 0) =>
  questionRows({ x0: colX(c), firstRow: UPPER.firstRow, startSlot, from, to, letters: ABCDE });
const low = (c, from, to, letters) =>
  questionRows({ x0: colX(c), firstRow: LOWER.firstRow, startSlot: 0, from, to, letters });

// Секции ответов: ключ секции → список вопросов с координатами кружков.
export const ANSWER_SECTIONS = SECTIONS.map(s => ({ ...s, questions: [] }));
const sec = key => ANSWER_SECTIONS.find(s => s.key === key);
sec('history').questions.push(...up(0, 1, 20));
sec('mathLit').questions.push(...up(1, 1, 10));
sec('reading').questions.push(...up(1, 1, 10, 12));      // после заголовка «Грамотность чтения»
sec('profile1').questions.push(...up(2, 1, 20), ...low(0, 21, 30, ABCDE), ...low(1, 31, 40, ABCDEF));
sec('profile2').questions.push(...up(3, 1, 20), ...low(2, 21, 30, ABCDE), ...low(3, 31, 40, ABCDEF));

// ---------- Код версии бланка внизу ----------
// 8 клеток 3×3 мм между нижними метками: клетки 0 и 7 всегда чёрные (рамка),
// клетки 1–6 — номер версии в двоичном виде (старший бит слева).
export const VERSION_CODE = (() => {
  const size = 3, gap = 1, count = 8;
  const total = count * size + (count - 1) * gap;
  const x0 = PAGE.w / 2 - total / 2;
  const bits = SHEET_VERSION.toString(2).padStart(6, '0');
  return {
    textY: 281,
    cells: Array.from({ length: count }, (_, i) => ({
      x: x0 + i * (size + gap),
      y: 284.5,
      size,
      filled: i === 0 || i === count - 1 || bits[i - 1] === '1',
    })),
  };
})();

// Все кружки бланка одним списком — удобно для проверок и распознавания.
export function allBubbles() {
  const list = [];
  STUDENT_ID.columns.forEach((c, i) => c.bubbles.forEach(b => list.push({ group: `id${i}`, ...b })));
  VARIANT.columns.forEach((c, i) => c.bubbles.forEach(b => list.push({ group: `var${i}`, ...b })));
  SUBJECT_BUBBLES.forEach(b => list.push({ group: 'subject', ...b }));
  ANSWER_SECTIONS.forEach(s => s.questions.forEach(q =>
    q.options.forEach(o => list.push({ group: `${s.key}:${q.n}`, ...o }))));
  return list;
}
