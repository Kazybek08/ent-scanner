// Генератор искусственных «фото» заполненного бланка для автотестов распознавания.
import {
  PAGE, BUBBLE_R, MARKERS, STUDENT_ID, VARIANT, SUBJECT_BUBBLES, SUBJECT_BUBBLES_V3, SUBJECT_ROWS, ANSWER_SECTIONS, VERSION_CODE, LETTERS, optionsForAnswer, optionCode,
} from '../src/template.js';
import { homography, project } from '../src/omr.js';

// детерминированный генератор случайных чисел
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- лист бланка в растре (px/мм = k) ----------
function drawPage(k, marks, version = null) {
  const W = Math.round(PAGE.w * k), Hh = Math.round(PAGE.h * k);
  const p = new Float32Array(W * Hh).fill(245);
  const put = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < Hh) { const i = y * W + x; if (v < p[i]) p[i] = v; } };
  const rect = (x, y, w, h, v) => {
    for (let yy = Math.round(y * k); yy < Math.round((y + h) * k); yy++)
      for (let xx = Math.round(x * k); xx < Math.round((x + w) * k); xx++) put(xx, yy, v);
  };
  const shape = (cx, cy, r, v, test) => {
    for (let yy = Math.floor((cy - r) * k); yy <= Math.ceil((cy + r) * k); yy++)
      for (let xx = Math.floor((cx - r) * k); xx <= Math.ceil((cx + r) * k); xx++) {
        const dx = xx / k - cx, dy = yy / k - cy;
        if (test(dx, dy)) put(xx, yy, v);
      }
  };
  const ring = (cx, cy) => shape(cx, cy, BUBBLE_R + 0.2, 70, (dx, dy) => Math.abs(Math.hypot(dx, dy) - BUBBLE_R) <= 0.13);

  for (const m of MARKERS) rect(m.x, m.y, m.size, m.size, 15);
  // version — нарисовать код другой (например, старой) версии бланка
  const bits = version === null ? null : version.toString(2).padStart(6, '0');
  VERSION_CODE.cells.forEach((c, i) => {
    const filled = bits === null ? c.filled : (i === 0 || i === VERSION_CODE.cells.length - 1 || bits[i - 1] === '1');
    if (filled) rect(c.x, c.y, c.size, c.size, 15);
    else { rect(c.x, c.y, c.size, 0.2, 15); rect(c.x, c.y + c.size - 0.2, c.size, 0.2, 15);
           rect(c.x, c.y, 0.2, c.size, 15); rect(c.x + c.size - 0.2, c.y, 0.2, c.size, 15); }
  });
  // «текст» шапки и подписи
  for (let i = 0; i < 18; i++) rect(55 + i * 7.5, 12.5, 5.5, 3.6, 20);
  for (let i = 0; i < 16; i++) rect(62 + i * 7.5, 19, 5.5, 3.2, 20);
  rect(39, 32.6, 154, 0.2, 70); rect(37, 40.1, 43, 0.2, 70);
  rect(17, 44, 20, 2.5, 30); rect(66, 44, 60, 2.5, 30);
  for (let i = 0; i < 6; i++) rect(68, 84 + i * 2.3, 120, 1.4, 40);

  const all = [
    ...STUDENT_ID.columns.flatMap(c => c.bubbles), ...VARIANT.columns.flatMap(c => c.bubbles),
    ...(version === 3 ? SUBJECT_BUBBLES_V3 : SUBJECT_BUBBLES), ...ANSWER_SECTIONS.flatMap(s => s.questions.flatMap(q => q.options)),
  ];
  for (const b of all) {
    ring(b.x, b.y);
    rect(b.x - 0.6, b.y - 0.8, 1.2, 1.6, 170);      // светло-серая буква
  }
  for (const s of ANSWER_SECTIONS) for (const q of s.questions) rect(q.numberX - 3, q.y - 1, 3, 2, 25);

  // закрашивания
  const ink = 35;
  for (const { x, y, type } of marks) {
    const R = BUBBLE_R * 0.95;
    if (type === 'full') shape(x, y, R, ink, (dx, dy) => dx * dx + dy * dy <= R * R);
    else if (type === 'blue') shape(x, y, R, 95, (dx, dy) => dx * dx + dy * dy <= R * R);
    else if (type === 'messy') shape(x, y, R + 0.4, ink, (dx, dy) => Math.hypot(dx * 0.9, dy) <= R + 0.1);
    else if (type === 'half') shape(x, y, R, ink, (dx, dy) => dx * dx + dy * dy <= R * R && dy > 0);
    else if (type === 'light') shape(x, y, R, 165, (dx, dy) => dx * dx + dy * dy <= R * R);
    else if (type === 'x') shape(x, y, R, ink, (dx, dy) => Math.hypot(dx, dy) <= R && (Math.abs(dx - dy) < 0.3 || Math.abs(dx + dy) < 0.3));
    else if (type === 'check') shape(x, y, R, ink, (dx, dy) =>
      (dx < 0 && Math.abs(dy - (-dx * 0.0 + 0.6 + dx * -1)) < 0.3 && dx > -1.2) || (dx >= 0 && Math.abs(dy - (0.6 - dx * 1.3)) < 0.3 && dx < 1.4));
    else if (type === 'dot') shape(x, y, 0.5, ink, (dx, dy) => dx * dx + dy * dy <= 0.25);
  }
  return { p, W, H: Hh };
}

/**
 * Делает «фото» листа.
 * @param {object} o
 * @param {Array<{x,y,type}>} o.marks  что закрашено (координаты — центры кружков, мм)
 * @param {number} o.seed
 * @param {'portrait'|'landscape'|'upside'} [o.orient]
 */
export function synthPhoto({ marks, seed = 1, orient = 'portrait', camW = 1200, camH = 1600, tilt = 1, lighting = 1, noise = 6, version = null }) {
  const R = rng(seed);
  const k = 6;
  const page = drawPage(k, marks, version);
  // углы листа на фото: случайная перспектива
  const jitter = (v) => (R() - 0.5) * v * tilt;
  const outW = orient === 'landscape' ? camH : camW, outH = orient === 'landscape' ? camW : camH;
  const marginX = outW * 0.08, marginY = outH * 0.06;
  let dst = [
    [marginX + jitter(outW * 0.08), marginY + jitter(outH * 0.05)],
    [outW - marginX + jitter(outW * 0.08), marginY + jitter(outH * 0.05)],
    [outW - marginX + jitter(outW * 0.08), outH - marginY + jitter(outH * 0.05)],
    [marginX + jitter(outW * 0.08), outH - marginY + jitter(outH * 0.05)],
  ];
  if (orient === 'landscape') {
    // лист повёрнут на 90°: верх листа у правого края фото
    const sx = outW, sy = outH;
    dst = [[sx * 0.92, sy * 0.06], [sx * 0.92, sy * 0.94], [sx * 0.05, sy * 0.94], [sx * 0.05, sy * 0.06]]
      .map(([x, y]) => [x + jitter(40), y + jitter(30)]);
  }
  if (orient === 'upside') dst = [dst[2], dst[3], dst[0], dst[1]];
  const src = [[0, 0], [PAGE.w, 0], [PAGE.w, PAGE.h], [0, PAGE.h]];
  const Hinv = homography(dst, src);           // пиксель фото → мм листа

  const out = new Uint8Array(outW * outH);
  const gx = R() * 2 - 1, gy = R() * 2 - 1;
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const [X, Y] = project(Hinv, x + 0.5, y + 0.5);
    let v;
    if (X < 0 || Y < 0 || X >= PAGE.w || Y >= PAGE.h) {
      v = 95 + 25 * Math.sin(x * 0.05) * Math.cos(y * 0.07);          // стол
    } else {
      const px = X * k, py = Y * k;
      const x0 = Math.min(page.W - 2, px | 0), y0 = Math.min(page.H - 2, py | 0), tx = px - x0, ty = py - y0;
      const p = page.p, W = page.W;
      v = (p[y0 * W + x0] * (1 - tx) + p[y0 * W + x0 + 1] * tx) * (1 - ty) + (p[(y0 + 1) * W + x0] * (1 - tx) + p[(y0 + 1) * W + x0 + 1] * tx) * ty;
    }
    // освещение: плавный градиент и тень
    const light = 1 - lighting * (0.18 * (gx * x / outW + gy * y / outH + 1) + 0.15 * Math.exp(-(((x - outW * 0.7) ** 2) + ((y - outH * 0.3) ** 2)) / (2 * (outW * 0.25) ** 2)));
    v = v * light + (R() - 0.5) * 2 * noise;
    out[y * outW + x] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return { width: outW, height: outH, gray: out };
}

// Удобный конструктор отметок: что и как закрашено.
// Ответ сопоставления — две буквы по пунктам 1) и 2) («-» — пункт пустой); стиль — ключ «секция:№:1A».
// extra: дополнительные кружки [секция, №, код] (например, второй кружок в строке сопоставления).
// subjects: [индекс профиля 1, индекс профиля 2] — кружки «1» и «2»; subjectMarks — свои отметки [индекс, слот];
// sheet: 3 — старый бланк (один кружок на предмет).
export function buildMarks({ id = '0001', variant = '01', subjects = [0, 1], subjectMarks = null, answers = {}, style = {}, extra = [], sheet = 4 }) {
  const marks = [];
  [...id].forEach((d, i) => { if (d === '?') return; const b = STUDENT_ID.columns[i].bubbles[+d]; marks.push({ x: b.x, y: b.y, type: 'full' }); });
  [...variant].forEach((d, i) => { const b = VARIANT.columns[i].bubbles[+d]; marks.push({ x: b.x, y: b.y, type: 'full' }); });
  if (sheet === 3) for (const s of subjects) { const b = SUBJECT_BUBBLES_V3[s]; marks.push({ x: b.x, y: b.y, type: 'full' }); }
  else for (const [s, slot] of subjectMarks ?? subjects.map((s, i) => [s, i + 1])) {
    const b = SUBJECT_ROWS[s].options[slot - 1]; marks.push({ x: b.x, y: b.y, type: 'full' });
  }
  for (const sec of ANSWER_SECTIONS) {
    for (const q of sec.questions) {
      for (const o of optionsForAnswer(q, answers[sec.key]?.[q.n] ?? '')) {
        marks.push({ x: o.x, y: o.y, type: style[`${sec.key}:${q.n}:${optionCode(o)}`] ?? 'full' });
      }
    }
  }
  for (const [sec, n, code] of extra) {
    const o = ANSWER_SECTIONS.find(s => s.key === sec).questions.find(q => q.n === n).options.find(o => optionCode(o) === code);
    marks.push({ x: o.x, y: o.y, type: 'full' });
  }
  return marks;
}

export function randomAnswers(R, fillRate = 0.9) {
  const answers = {};
  for (const sec of ANSWER_SECTIONS) {
    answers[sec.key] = {};
    for (const q of sec.questions) {
      if (R() > fillRate) continue;
      const letters = LETTERS[q.type];
      const pickOne = () => letters[(R() * letters.length) | 0];
      if (q.type === 'match') {
        const a = (R() < 0.08 ? '-' : pickOne()) + (R() < 0.08 ? '-' : pickOne());
        if (a !== '--') answers[sec.key][q.n] = a;
      } else if (q.type === 'multi') {
        const n = 1 + ((R() * 3) | 0);
        const set = new Set();
        while (set.size < n) set.add(pickOne());
        answers[sec.key][q.n] = [...set].sort().join('');
      } else answers[sec.key][q.n] = pickOne();
    }
  }
  return answers;
}
