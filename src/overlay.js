// Рисует распознанные отметки поверх фото бланка.
import { project } from './omr.js';
import { ANSWER_SECTIONS, STUDENT_ID, VARIANT, BUBBLE_R } from './template.js';

const COLORS = {
  filled: 'rgba(15,118,110,0.95)',     // распознано как закрашенное
  edited: 'rgba(124,58,237,0.95)',     // исправлено оператором
  doubt: 'rgba(250,204,21,0.55)',      // сомнительно — жёлтая подсветка
  row: 'rgba(250,204,21,0.22)',
};

/**
 * @param {CanvasRenderingContext2D} ctx  холст, на котором уже нарисовано фото
 * @param {object} res    результат recognize()
 * @param {number} scale  во сколько раз холст меньше изображения, на котором шло распознавание
 * @param {object} [eff]  итоговые значения с исправлениями (results.effective)
 */
export function drawOverlay(ctx, res, scale = 1, eff = null) {
  if (!res.ok) return;
  const answersOf = eff ? eff.answers : res.answers;
  const P = (x, y) => { const [px, py] = project(res.H, x, y); return [px * scale, py * scale]; };
  const mm = Math.hypot(...(([a, b], [c, d]) => [a - c, b - d])(P(100, 150), P(101, 150)));
  const r = BUBBLE_R * mm;
  ctx.lineWidth = Math.max(1.5, mm * 0.45);

  const circle = (x, y, kind) => {
    const [px, py] = P(x, y);
    ctx.beginPath();
    ctx.arc(px, py, kind === 'doubt' ? r * 1.25 : r * 1.15, 0, Math.PI * 2);
    if (kind === 'doubt') { ctx.fillStyle = COLORS.doubt; ctx.fill(); }
    else { ctx.strokeStyle = kind === 'edited' ? COLORS.edited : COLORS.filled; ctx.stroke(); }
  };
  const rowBand = (q) => {
    const first = q.options[0], last = q.options[q.options.length - 1];
    const pts = [P(first.x - 8, q.y - 2.2), P(last.x + 2.5, q.y - 2.2), P(last.x + 2.5, q.y + 2.2), P(first.x - 8, q.y + 2.2)];
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = COLORS.row;
    ctx.fill();
  };

  for (const s of ANSWER_SECTIONS) {
    for (const q of s.questions) {
      const a = answersOf[s.key][q.n];
      if (a.status === 'check') rowBand(q);
      q.options.forEach((o, i) => {
        const v = a.scores?.[i] ?? 0;
        if (a.marked.includes(o.letter)) circle(o.x, o.y, a.edited ? 'edited' : 'filled');
        if (!a.edited && (a.weak.includes(o.letter) || (a.status === 'check' && v >= 0.15 && !a.marked.includes(o.letter)))) circle(o.x, o.y, 'doubt');
      });
    }
  }
  // ID, вариант, предметы: что прочитано и что сомнительно
  for (const m of res.marks) circle(m.x, m.y, m.c === 'filled' ? 'filled' : 'doubt');
  // колонка ID/варианта без ответа — подсветить её целиком
  const flaggedColumn = (cols, raw) => cols.forEach((col, i) => {
    if (raw?.[i] !== '?') return;
    const a = col.bubbles[0], b = col.bubbles[9];
    const pts = [P(a.x - 2.4, a.y - 2.4), P(a.x + 2.4, a.y - 2.4), P(b.x + 2.4, b.y + 2.4), P(b.x - 2.4, b.y + 2.4)];
    ctx.beginPath();
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = COLORS.row;
    ctx.fill();
  });
  flaggedColumn(STUDENT_ID.columns, res.studentIdRaw);
  flaggedColumn(VARIANT.columns, res.variantRaw);
}
