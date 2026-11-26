// Лаборатория распознавания (только для разработки, в приложение не входит).
// Делает «фото» НАСТОЯЩЕГО бланка из out/blank-v<версия>.pdf с закрашенными ответами.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { STUDENT_ID, VARIANT, SUBJECT_ROWS, CREATIVE_BUBBLE, ANSWER_SECTIONS, PAGE, SHEET_VERSION, LETTERS, optionsForAnswer, optionCode } from '../src/template.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

let pageCanvasPromise;
async function sheetCanvas(pxPerMm = 6) {
  return (pageCanvasPromise ??= (async () => {
    const pdf = await pdfjs.getDocument({ url: new URL(`../out/blank-v${SHEET_VERSION}.pdf`, import.meta.url).href }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: (pxPerMm * 25.4) / 72 });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    // intent 'print' — без requestAnimationFrame: рисует и когда окно браузера скрыто
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
    return c;
  })());
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function randomSheet(seed) {
  const R = rng(seed);
  const answers = {};
  for (const sec of ANSWER_SECTIONS) {
    answers[sec.key] = {};
    for (const q of sec.questions) {
      if (R() > 0.9) continue;
      const L = LETTERS[q.type];
      const one = () => L[(R() * L.length) | 0];
      if (q.type === 'match') answers[sec.key][q.n] = one() + one();
      else if (q.type === 'multi') { const s = new Set(); const n = 1 + ((R() * 3) | 0); while (s.size < n) s.add(one()); answers[sec.key][q.n] = [...s].sort().join(''); }
      else answers[sec.key][q.n] = one();
    }
  }
  return {
    answers,
    id: String(1 + ((R() * 9998) | 0)).padStart(4, '0'),
    variant: R() < 0.5 ? '01' : '02',
    subjects: [(R() * 6) | 0, 6 + ((R() * 6) | 0)],
  };
}

/** Заполненный бланк → «фото» (canvas). pen: 'black' | 'blue'. */
export async function makePhoto({ answers, id, variant, subjects, creative = false, faint = [] }, { seed = 1, angle = 3, pen = 'black', w = 1200, h = 1600 } = {}) {
  const R = rng(seed);
  const k = 6;
  const src = await sheetCanvas(k);
  const sheet = document.createElement('canvas');
  sheet.width = src.width; sheet.height = src.height;
  const sx = sheet.getContext('2d');
  sx.drawImage(src, 0, 0);
  sx.fillStyle = pen === 'blue' ? 'rgba(25,45,160,0.92)' : 'rgba(20,20,25,0.95)';
  const dot = (x, y) => {
    sx.beginPath();
    sx.ellipse((x + (R() - 0.5) * 0.4) * k, (y + (R() - 0.5) * 0.4) * k, 1.65 * k, 1.55 * k, R() * 3, 0, Math.PI * 2);
    sx.fill();
  };
  [...id].forEach((d, i) => { if (d === '?') return; const b = STUDENT_ID.columns[i].bubbles[+d]; dot(b.x, b.y); });
  // бледные (сомнительные) отметки: [секция, номер, код кружка: «C» или для сопоставления «2C»]
  for (const [sec, n, L] of faint) {
    const o = ANSWER_SECTIONS.find(s => s.key === sec).questions.find(q => q.n === n).options.find(o => optionCode(o) === L);
    const keep = sx.fillStyle;
    sx.fillStyle = 'rgba(110,110,120,0.45)';
    dot(o.x, o.y);
    sx.fillStyle = keep;
  }
  [...variant].forEach((d, i) => { const b = VARIANT.columns[i].bubbles[+d]; dot(b.x, b.y); });
  // subjects = [профиль 1, профиль 2] → кружки «1» и «2»
  subjects.forEach((s, i) => { const o = SUBJECT_ROWS[s].options[i]; dot(o.x, o.y); });
  if (creative) dot(CREATIVE_BUBBLE.x, CREATIVE_BUBBLE.y);
  for (const sec of ANSWER_SECTIONS) for (const q of sec.questions)
    for (const o of optionsForAnswer(q, answers[sec.key]?.[q.n] ?? '')) dot(o.x, o.y);

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#6b5b4b'); bg.addColorStop(1, '#3d342c');       // деревянный стол
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / PAGE.w, h / PAGE.h) * 0.86 / k;
  ctx.save();
  ctx.translate(w / 2 + (R() - 0.5) * 40, h / 2 + (R() - 0.5) * 40);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.filter = 'blur(0.6px)';
  ctx.drawImage(sheet, -sheet.width / 2, -sheet.height / 2);
  ctx.restore();
  // тень от руки/телефона и неравномерный свет
  const sh = ctx.createRadialGradient(w * 0.75, h * 0.25, 10, w * 0.75, h * 0.25, w * 0.6);
  sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
  const warm = ctx.createLinearGradient(0, 0, 0, h);
  warm.addColorStop(0, 'rgba(255,200,120,0.08)'); warm.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = warm; ctx.fillRect(0, 0, w, h);
  return out;
}

export function compare(res, sheet) {
  const wrong = [];
  if (!res.ok) return { ok: false, error: res.error, wrong };
  for (const sec of ANSWER_SECTIONS) for (const q of sec.questions) {
    const a = res.answers[sec.key][q.n];
    const want = sheet.answers[sec.key]?.[q.n] ?? '';
    if (a.status !== 'check' && a.marked !== want) wrong.push(`${sec.key}:${q.n} ${a.marked}≠${want}`);
  }
  if (res.studentId !== sheet.id) wrong.push(`id ${res.studentIdRaw}≠${sheet.id}`);
  if (res.variant !== sheet.variant) wrong.push(`variant ${res.variantRaw}≠${sheet.variant}`);
  const wantSubj = sheet.subjects.map(i => SUBJECT_ROWS[i].code).join(',');
  if (res.subjects.join(',') !== wantSubj) wrong.push(`subjects ${res.subjects}≠${wantSubj}`);
  if (res.creative !== !!sheet.creative) wrong.push(`creative ${res.creative}`);
  return { ok: true, wrong, flags: res.flags.length, ms: res.ms };
}
