// ПОДСЧЁТ БАЛЛОВ (раздел 2 ТЗ). Чистые функции — без экрана и хранилища, покрыты автотестами.
import { DEFAULT_SUBJECTS } from './subjects.js';

export const MAX_TOTAL = 140;

/**
 * Баллы за один вопрос.
 * Обычный вопрос: 1 — если отмечен ровно один кружок и он верный, иначе 0.
 * Вопросы 31–40 профиля (multi): 2 — набор полностью верный, 1 — одна ошибка
 * (один лишний ИЛИ один пропущенный кружок), иначе 0. Пустой ответ — 0.
 * @returns {number|null} null — если нет ключа
 */
export function scoreQuestion(marked, key, multi) {
  if (!key) return null;
  marked = marked || '';
  if (!multi) return marked.length === 1 && marked === key ? 1 : 0;
  if (!marked) return 0;
  const m = new Set(marked), k = new Set(key);
  let errors = 0;
  for (const x of m) if (!k.has(x)) errors++;
  for (const x of k) if (!m.has(x)) errors++;
  return errors === 0 ? 2 : errors === 1 ? 1 : 0;
}

export const isMulti = (section, n) => (section === 'profile1' || section === 'profile2') && n >= 31;
export const maxFor = (section, n) => (isMulti(section, n) ? 2 : 1);

/**
 * Какой из двух выбранных предметов «Профиль 1», какой «Профиль 2».
 * Сначала ищем пару в списке комбинаций из настроек, иначе — порядок в списке предметов.
 * @param {string[]} codes  два кода предметов с бланка
 * @param {Array<[string,string]>} combos  пары [профиль1, профиль2]
 */
export function orderProfiles(codes, combos = [], subjects = DEFAULT_SUBJECTS) {
  if (!codes || codes.length !== 2) return null;
  const [a, b] = codes;
  for (const [p1, p2] of combos) {
    if (p1 === a && p2 === b) return [a, b];
    if (p1 === b && p2 === a) return [b, a];
  }
  const idx = c => { const i = subjects.findIndex(s => s.code === c); return i < 0 ? 999 : i; };
  return idx(a) <= idx(b) ? [a, b] : [b, a];
}

/**
 * Баллы за бланк.
 * @param {object} p
 * @param {object} p.answers   { history: {1: 'A', ...}, mathLit, reading, profile1, profile2 } — отмеченные буквы
 * @param {string[]} p.profiles [код профиля 1, код профиля 2]
 * @param {object} p.key       ключ варианта: { history: {1: {a:'C', topic}}, ..., subjects: { math: {1: {a, topic}} } }
 */
export function scoreSheet({ answers, profiles, key }) {
  const parts = {};
  const missing = [];
  const blocks = [
    ['history', key?.history, 20],
    ['mathLit', key?.mathLit, 10],
    ['reading', key?.reading, 10],
    ['profile1', profiles ? key?.subjects?.[profiles[0]] : null, 40],
    ['profile2', profiles ? key?.subjects?.[profiles[1]] : null, 40],
  ];
  let total = 0, max = 0, complete = true;
  for (const [section, k, count] of blocks) {
    const part = { points: 0, max: 0, correct: 0, wrong: [], subject: null };
    if (section === 'profile1' || section === 'profile2') part.subject = profiles?.[section === 'profile1' ? 0 : 1] ?? null;
    if (!k) {
      missing.push(part.subject ? `${section}:${part.subject}` : section);
      complete = false;
      parts[section] = { ...part, points: null };
      continue;
    }
    for (let n = 1; n <= count; n++) {
      const multi = isMulti(section, n);
      const pts = scoreQuestion(answers?.[section]?.[n] ?? '', k[n]?.a, multi);
      const mx = multi ? 2 : 1;
      part.max += mx;
      if (pts === null) { complete = false; continue; }
      part.points += pts;
      if (pts === mx) part.correct++;
      else part.wrong.push({ n, marked: answers?.[section]?.[n] ?? '', key: k[n].a, points: pts, topic: k[n].topic || '' });
    }
    total += part.points;
    max += part.max;
    parts[section] = part;
  }
  return { parts, total, max, complete, missing };
}
