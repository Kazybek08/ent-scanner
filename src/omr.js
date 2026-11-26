// РАСПОЗНАВАНИЕ БЛАНКА (OMR) без сторонних библиотек.
// Шаги: яркость → выравнивание освещения → поиск 4 угловых меток →
// перспектива (гомография) → ориентация по коду версии → заливка каждого кружка.
// Работает и в браузере, и в Node (для автотестов).

import {
  MARKERS, BUBBLE_R, STUDENT_ID, VARIANT, SUBJECT_ROWS, SUBJECT_BUBBLES_V3, ANSWER_SECTIONS, VERSION_CODE, READABLE_VERSIONS,
} from './template.js';
import { DEFAULT_SUBJECTS } from './subjects.js';

// Пороги заливки (доля «чернил» в кружке после поправки на фон бланка).
// «Сомнительно» снижено с 0,25 из ТЗ до 0,15: галочка даёт ~0,2, а пустой кружок — не больше ~0,07.
// Лучше лишний раз подсветить, чем молча поставить 0. Уточним на настоящих фото.
export const THRESHOLDS = { filled: 0.55, doubtful: 0.15 };

// ---------- 1. Яркость ----------
function toGray(img) {
  if (img.gray) return img.gray;
  const { data, width, height } = img;
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }
  return g;
}

// ---------- 2. Выравнивание освещения ----------
// Делим каждый пиксель на «яркость бумаги» вокруг него: тени и градиенты пропадают.
function normalize(gray, w, h) {
  const B = Math.max(12, Math.round(Math.max(w, h) / 48));
  const gw = Math.ceil(w / B), gh = Math.ceil(h / B);
  const m = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const row = ((y / B) | 0) * gw;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x], bi = row + ((x / B) | 0);
      if (v > m[bi]) m[bi] = v;
    }
  }
  // расширяем максимум на соседние блоки, чтобы крупные тёмные пятна (метки) не стали «бумагой»
  const bg = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    let mx = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = by + dy, xx = bx + dx;
      if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && m[yy * gw + xx] > mx) mx = m[yy * gw + xx];
    }
    bg[by * gw + bx] = Math.max(mx, 30);
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let fy = (y + 0.5) / B - 0.5; if (fy < 0) fy = 0; if (fy > gh - 1) fy = gh - 1;
    const y0 = fy | 0, y1 = Math.min(y0 + 1, gh - 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      let fx = (x + 0.5) / B - 0.5; if (fx < 0) fx = 0; if (fx > gw - 1) fx = gw - 1;
      const x0 = fx | 0, x1 = Math.min(x0 + 1, gw - 1), tx = fx - x0;
      const b = (bg[y0 * gw + x0] * (1 - tx) + bg[y0 * gw + x1] * tx) * (1 - ty)
              + (bg[y1 * gw + x0] * (1 - tx) + bg[y1 * gw + x1] * tx) * ty;
      const v = (gray[y * w + x] / b) * 255;
      out[y * w + x] = v > 255 ? 255 : v;
    }
  }
  return out;
}

// ---------- 3. Поиск угловых меток ----------
function components(norm, w, h, darkLevel) {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const list = [];
  let next = 1;
  for (let start = 0; start < w * h; start++) {
    if (label[start] || norm[start] >= darkLevel) continue;
    let sp = 0, area = 0, sx = 0, sy = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    stack[sp++] = start; label[start] = next;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && !label[p - 1] && norm[p - 1] < darkLevel) { label[p - 1] = next; stack[sp++] = p - 1; }
      if (x < w - 1 && !label[p + 1] && norm[p + 1] < darkLevel) { label[p + 1] = next; stack[sp++] = p + 1; }
      if (y > 0 && !label[p - w] && norm[p - w] < darkLevel) { label[p - w] = next; stack[sp++] = p - w; }
      if (y < h - 1 && !label[p + w] && norm[p + w] < darkLevel) { label[p + w] = next; stack[sp++] = p + w; }
    }
    list.push({ area, cx: sx / area, cy: sy / area, minX, maxX, minY, maxY });
    next++;
  }
  return list;
}

function markerCandidates(norm, w, h, comps = components(norm, w, h, 128)) {
  const L = Math.max(w, h);
  const minSide = Math.max(6, L / 160), maxSide = L / 10;
  const out = [];
  for (const c of comps) {
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    c.why = 'border';
    if (c.minX === 0 || c.minY === 0 || c.maxX === w - 1 || c.maxY === h - 1) continue;
    c.why = 'size';
    if (bw < minSide || bh < minSide || bw > maxSide || bh > maxSide) continue;
    c.why = 'aspect';
    if (bw / bh > 2 || bh / bw > 2) continue;
    c.why = 'fill';
    if (c.area / (bw * bh) < 0.55) continue;
    c.why = 'ring';
    // вокруг метки должна быть белая бумага
    const pad = Math.max(bw, bh) * 0.45;
    let dark = 0, n = 0;
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      const pts = [
        [c.minX - pad + t * (bw + 2 * pad), c.minY - pad], [c.minX - pad + t * (bw + 2 * pad), c.maxY + pad],
        [c.minX - pad, c.minY - pad + t * (bh + 2 * pad)], [c.maxX + pad, c.minY - pad + t * (bh + 2 * pad)],
      ];
      for (const [x, y] of pts) {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) { dark++; n++; continue; }
        if (norm[yi * w + xi] < 128) dark++;
        n++;
      }
    }
    if (dark / n > 0.2) continue;
    c.why = 'ok';
    out.push({ x: c.cx, y: c.cy, side: Math.sqrt(c.area) });
  }
  return out;
}

const SHEET_RATIO = (MARKERS[1].cx - MARKERS[0].cx) / (MARKERS[3].cy - MARKERS[0].cy); // ширина/высота ≈ 0,684
const SPAN_MM = 2 * ((MARKERS[1].cx - MARKERS[0].cx) + (MARKERS[3].cy - MARKERS[0].cy));

function pickCorners(cands) {
  if (cands.length < 4) return null;
  const dirs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];          // по часовой: ↖ ↗ ↘ ↙
  const tops = dirs.map(([dx, dy]) =>
    [...cands].sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy)).slice(0, 4));
  let best = null;
  for (const a of tops[0]) for (const b of tops[1]) for (const c of tops[2]) for (const d of tops[3]) {
    const q = [a, b, c, d];
    if (new Set(q).size < 4) continue;
    // выпуклость
    let sign = 0, convex = true;
    for (let i = 0; i < 4; i++) {
      const p0 = q[i], p1 = q[(i + 1) % 4], p2 = q[(i + 2) % 4];
      const cr = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (!sign) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) { convex = false; break; }
    }
    if (!convex) continue;
    const len = (p, r) => Math.hypot(p.x - r.x, p.y - r.y);
    const top = len(a, b), right = len(b, c), bottom = len(c, d), left = len(d, a);
    const r = (top + bottom) / (left + right);
    const ratioErr = Math.min(Math.abs(Math.log(r / SHEET_RATIO)), Math.abs(Math.log(r * SHEET_RATIO)));
    if (ratioErr > 0.4) continue;
    const pxPerMm = (top + right + bottom + left) / SPAN_MM;
    let sizeErr = 0, sizeOk = true;
    for (const p of q) {
      const k = p.side / (MARKERS[0].size * pxPerMm);
      if (k < 0.55 || k > 1.7) sizeOk = false;
      sizeErr += Math.abs(Math.log(k));
    }
    if (!sizeOk) continue;
    // метки — самые крайние тёмные квадраты листа: снаружи четырёхугольника таких быть не должно
    const minSide = Math.min(...q.map(p => p.side));
    let outside = false;
    for (const c of cands) {
      if (q.includes(c) || c.side < minSide * 0.6) continue;
      for (let i = 0; i < 4 && !outside; i++) {
        const p0 = q[i], p1 = q[(i + 1) % 4];
        const ex = p1.x - p0.x, ey = p1.y - p0.y, el = Math.hypot(ex, ey);
        const dist = ((ex) * (c.y - p0.y) - (ey) * (c.x - p0.x)) / el * sign;   // >0 — внутри
        if (dist < -c.side * 0.5) outside = true;
      }
      if (outside) break;
    }
    if (outside) continue;
    const err = ratioErr + 0.5 * (Math.abs(Math.log(top / bottom)) + Math.abs(Math.log(left / right))) + 0.25 * sizeErr;
    if (!best || err < best.err) best = { q, err, pxPerMm };
  }
  return best;
}

// для отладки: промежуточные данные поиска меток
export function __debug(img) {
  const norm = normalize(toGray(img), img.width, img.height);
  const comps = components(norm, img.width, img.height, 128);
  const cands = markerCandidates(norm, img.width, img.height, comps);
  return { norm, comps, cands, corners: pickCorners(cands) };
}

// ---------- 4. Гомография (мм бланка → пиксели фото) ----------
export function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = src[i], [x, y] = dst[i];
    A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y, x]);
    A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y, y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function project(H, X, Y) {
  const d = H[6] * X + H[7] * Y + 1;
  return [(H[0] * X + H[1] * Y + H[2]) / d, (H[3] * X + H[4] * Y + H[5]) / d];
}

function sample(norm, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
  const x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, i = y0 * w + x0;
  return (norm[i] * (1 - tx) + norm[i + 1] * tx) * (1 - ty) + (norm[i + w] * (1 - tx) + norm[i + w + 1] * tx) * ty;
}

// средняя «чернильность» участка (0 — бумага, 1 — чернила)
const INK_DARK = 0.35 * 255, INK_LIGHT = 0.85 * 255;
function inkAt(v) {
  if (v <= INK_DARK) return 1;
  if (v >= INK_LIGHT) return 0;
  return (INK_LIGHT - v) / (INK_LIGHT - INK_DARK);
}

const DISC = (() => {           // точки внутри кружка (мм), без контура
  const r = BUBBLE_R * 0.7, pts = [];
  for (let y = -r; y <= r + 1e-9; y += 0.25) for (let x = -r; x <= r + 1e-9; x += 0.25)
    if (x * x + y * y <= r * r) pts.push([x, y]);
  return pts;
})();

function bubbleInk(norm, w, h, H, X, Y) {
  let s = 0;
  for (const [dx, dy] of DISC) {
    const [x, y] = project(H, X + dx, Y + dy);
    s += inkAt(sample(norm, w, h, x, y));
  }
  return s / DISC.length;
}

function squareInk(norm, w, h, H, X, Y, half) {
  let s = 0, n = 0;
  for (let dy = -half; dy <= half + 1e-9; dy += half / 3) for (let dx = -half; dx <= half + 1e-9; dx += half / 3) {
    const [x, y] = project(H, X + dx, Y + dy);
    s += inkAt(sample(norm, w, h, x, y)); n++;
  }
  return s / n;
}

// ---------- 5. Ориентация и версия по коду внизу бланка ----------
// Крайние клетки кода (0 и 7) всегда чёрные — по ним и по 4 меткам находим, где низ бланка.
// Клетки 1–6 — номер версии бланка в двоичном виде: так старый бланк не прочитается по новой разметке.
function orientationInfo(norm, w, h, H) {
  let score = 0;
  for (const m of MARKERS) if (squareInk(norm, w, h, H, m.cx, m.cy, m.size * 0.3) > 0.7) score++;
  const cells = VERSION_CODE.cells;
  const inkOf = c => squareInk(norm, w, h, H, c.x + c.size / 2, c.y + c.size / 2, c.size * 0.3);
  if (inkOf(cells[0]) > 0.6) score++;
  if (inkOf(cells[cells.length - 1]) > 0.6) score++;
  let bits = '';
  for (const c of cells.slice(1, -1)) {
    const ink = inkOf(c);
    bits += ink > 0.6 ? '1' : ink < 0.3 ? '0' : '?';
  }
  if (!bits.includes('?')) score++;      // код читается чётко
  return { score, version: bits.includes('?') ? null : parseInt(bits, 2) };   // максимум 4 + 2 + 1 = 7
}

// ---------- 6. Решения по кружкам ----------
function classify(v) {
  return v >= THRESHOLDS.filled ? 'filled' : v >= THRESHOLDS.doubtful ? 'doubtful' : 'empty';
}

function digitsFrom(columns, score, kind, flags, marks) {
  let value = '';
  let ok = true;
  columns.forEach((col, ci) => {
    const states = col.bubbles.map(b => ({ b, s: score(b), c: classify(score(b)) }));
    for (const s of states) if (s.c !== 'empty') marks.push({ x: s.b.x, y: s.b.y, c: s.c });
    const filled = states.filter(s => s.c === 'filled');
    const doubtful = states.filter(s => s.c === 'doubtful');
    if (filled.length === 1 && doubtful.length === 0) value += filled[0].b.value;
    else {
      ok = false; value += '?';
      flags.push({ kind, column: ci, reason: filled.length === 0 && doubtful.length === 0 ? 'empty' : filled.length > 1 ? 'multiple' : 'weak' });
    }
  });
  return { value, ok };
}

/**
 * Предметы на бланке v4: у каждого предмета кружки «1» и «2».
 * Профиль 1 — предмет с закрашенной «1», Профиль 2 — с «2». Любая неясность — подсветка.
 */
function readSubjects(score, subjects, marks) {
  const code = r => subjects[r.index]?.code ?? String(r.index);
  const rows = SUBJECT_ROWS.map(r => ({ r, c: r.options.map(o => classify(score(o))) }));
  for (const { r, c } of rows) r.options.forEach((o, i) => { if (c[i] !== 'empty') marks.push({ x: o.x, y: o.y, c: c[i] }); });
  const weak = rows.some(x => x.c.includes('doubtful'));
  const p1 = rows.filter(x => x.c[0] === 'filled'), p2 = rows.filter(x => x.c[1] === 'filled');
  const same = p1.length === 1 && p2.length === 1 && p1[0] === p2[0];
  const good = p1.length === 1 && p2.length === 1 && !same;
  // что удалось понять — по порядку слотов, без повторов (для подсказки в редакторе)
  const codes = good ? [code(p1[0].r), code(p2[0].r)]
    : [...new Set([...p1, ...p2].map(x => code(x.r)))];
  let flag = null;
  if (weak) flag = { kind: 'subjects', reason: 'weak', count: codes.length };
  else if (same) flag = { kind: 'subjects', reason: 'same', count: 1 };
  else if (!good) flag = { kind: 'subjects', reason: 'slots', p1: p1.length, p2: p2.length, count: codes.length };
  return { codes, ordered: true, flag };
}

/** Предметы на бланке v3: один кружок на предмет, отмечено ровно 2; порядок — из настроек. */
function readSubjectsV3(score, subjects, marks) {
  const st = SUBJECT_BUBBLES_V3.map(b => ({ b, c: classify(score(b)) }));
  for (const s of st) if (s.c !== 'empty') marks.push({ x: s.b.x, y: s.b.y, c: s.c });
  const codes = st.filter(s => s.c === 'filled').map(s => subjects[s.b.index]?.code ?? String(s.b.index));
  const weak = st.some(s => s.c === 'doubtful');
  const flag = codes.length !== 2 || weak ? { kind: 'subjects', count: codes.length, reason: weak ? 'weak' : 'count' } : null;
  return { codes, ordered: false, flag };
}

/**
 * Распознаёт бланк.
 * @param {{width:number,height:number,data?:Uint8ClampedArray,gray?:Uint8Array}} img  RGBA (ImageData) или яркость
 * @returns {object} результат: ok, error, studentId, variant, subjects, answers, flags, scores, H
 */
export function recognize(img, { subjects = DEFAULT_SUBJECTS } = {}) {
  const t0 = Date.now();
  const { width: w, height: h } = img;
  const norm = normalize(toGray(img), w, h);

  const cands = markerCandidates(norm, w, h);
  const corners = pickCorners(cands);
  if (!corners) return { ok: false, error: 'markers', candidates: cands.length, ms: Date.now() - t0 };

  // перебираем 4 поворота: какой угол фото — какой угол бланка
  const tpl = [MARKERS[0], MARKERS[1], MARKERS[3], MARKERS[2]].map(m => [m.cx, m.cy]); // ↖ ↗ ↘ ↙
  let best = null;
  for (let k = 0; k < 4; k++) {
    const dst = tpl.map((_, j) => { const p = corners.q[(j + k) % 4]; return [p.x, p.y]; });
    const H = homography(tpl, dst);
    const info = orientationInfo(norm, w, h, H);
    if (!best || info.score > best.s) best = { H, s: info.score, k, version: info.version };
  }
  if (best.s < 7) return { ok: false, error: 'orientation', orientationScore: best.s, ms: Date.now() - t0 };
  if (!READABLE_VERSIONS.includes(best.version)) {
    return { ok: false, error: 'version', sheetVersion: best.version, ms: Date.now() - t0 };
  }
  const H = best.H;

  // сырая заливка всех кружков
  const raw = new Map();
  const rawOf = b => { let v = raw.get(b); if (v === undefined) { v = bubbleInk(norm, w, h, H, b.x, b.y); raw.set(b, v); } return v; };
  const answerBubbles = ANSWER_SECTIONS.flatMap(s => s.questions.flatMap(q => q.options));
  answerBubbles.forEach(rawOf);
  // фон пустого кружка (контур буквы, бумага) — медиана: большинство кружков пустые
  const sorted = answerBubbles.map(rawOf).sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length / 2)];
  const score = b => Math.max(0, Math.min(1, (rawOf(b) - base) / (1 - base)));

  const flags = [];
  const marks = [];          // отметки в ID, варианте и предметах — для показа поверх фото
  const id = digitsFrom(STUDENT_ID.columns, score, 'id', flags, marks);
  const variant = digitsFrom(VARIANT.columns, score, 'variant', flags, marks);

  const subj = best.version >= 4 ? readSubjects(score, subjects, marks) : readSubjectsV3(score, subjects, marks);
  if (subj.flag) flags.push(subj.flag);
  const chosen = subj.codes;

  const answers = {};
  for (const s of ANSWER_SECTIONS) {
    answers[s.key] = {};
    for (const q of s.questions) {
      const st = q.options.map(o => ({ o, s: score(o), c: classify(score(o)) }));
      const scores = st.map(x => +x.s.toFixed(2));
      if (q.type === 'match') {
        // сопоставление: в каждой строке 1) и 2) — ровно один кружок; ответ — две буквы («-» — пусто)
        let marked = '', weak = '', multiple = '';
        for (const item of [1, 2]) {
          const row = st.filter(x => x.o.item === item);
          const f = row.filter(x => x.c === 'filled'), d = row.filter(x => x.c === 'doubtful');
          marked += f.length === 1 ? f[0].o.letter : '-';
          for (const x of d) weak += `${item}${x.o.letter}`;
          if (f.length > 1) multiple += `${item}${f.map(x => x.o.letter).join('')}`;
        }
        let status = marked === '--' ? 'empty' : 'ok';
        if (weak) { status = 'check'; flags.push({ kind: 'answer', section: s.key, n: q.n, reason: 'weak', letters: weak }); }
        else if (multiple) { status = 'check'; flags.push({ kind: 'answer', section: s.key, n: q.n, reason: 'multiple', letters: multiple }); }
        answers[s.key][q.n] = { marked: marked === '--' ? '' : marked, weak, status, scores };
        continue;
      }
      const marked = st.filter(x => x.c === 'filled').map(x => x.o.letter).join('');
      const weak = st.filter(x => x.c === 'doubtful').map(x => x.o.letter).join('');
      let status = marked ? 'ok' : 'empty';
      if (weak) { status = 'check'; flags.push({ kind: 'answer', section: s.key, n: q.n, reason: 'weak', letters: weak }); }
      else if (q.type !== 'multi' && marked.length > 1) { status = 'check'; flags.push({ kind: 'answer', section: s.key, n: q.n, reason: 'multiple', letters: marked }); }
      answers[s.key][q.n] = { marked, weak, status, scores };
    }
  }

  const sheetPx = corners.pxPerMm * (MARKERS[3].cy - MARKERS[0].cy);
  const warnings = [];
  if (sheetPx < 700) warnings.push('small');

  return {
    ok: true,
    studentId: id.ok ? id.value : null, studentIdRaw: id.value,
    variant: variant.ok ? variant.value : null, variantRaw: variant.value,
    subjects: chosen,
    subjectsOrdered: subj.ordered,        // true — порядок [профиль 1, профиль 2] взят с бланка (v4)
    sheetVersion: best.version,
    answers, flags, warnings, marks,
    base: +base.toFixed(3), pxPerMm: +corners.pxPerMm.toFixed(2),
    corners: corners.q.map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.side)]),
    orientation: best.k, orientationScore: best.s,
    H, ms: Date.now() - t0,
  };
}
