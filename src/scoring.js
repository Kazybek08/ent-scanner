// ПОДСЧЁТ БАЛЛОВ. Чистые функции — без экрана и хранилища, покрыты автотестами.
// Формат профильного предмета (бланк v3, по пробникам центра):
//   1–30 — один ответ (1 балл); 31–35 — сопоставление, 2 пары (2/1/0);
//   36–40 — один–три верных из шести (2 — всё верно, 1 — одна ошибка, иначе 0).
import { DEFAULT_SUBJECTS } from './subjects.js';
import { questionType } from './template.js';

export const MAX_TOTAL = 140;

/**
 * Баллы за один вопрос.
 * @param {string} marked  отмеченное: буквы; для сопоставления — две буквы по пунктам («-» — пусто)
 * @param {string} key     ключ: буквы; для сопоставления — две буквы по пунктам 1) и 2)
 * @param {'single5'|'single'|'match'|'multi'|boolean} type  (true/false — старый вызов: multi/single)
 * @returns {number|null} null — если нет ключа
 */
export function scoreQuestion(marked, key, type) {
  if (!key) return null;
  if (type === true) type = 'multi';
  if (type === false || type === undefined) type = 'single';
  marked = marked || '';
  if (type === 'match') {
    let p = 0;
    for (let i = 0; i < 2; i++) if (marked[i] && marked[i] !== '-' && marked[i] === key[i]) p++;
    return p;
  }
  if (type !== 'multi') return marked.length === 1 && marked === key ? 1 : 0;
  if (!marked) return 0;
  const m = new Set(marked), k = new Set(key);
  let errors = 0;
  for (const x of m) if (!k.has(x)) errors++;
  for (const x of k) if (!m.has(x)) errors++;
  return errors === 0 ? 2 : errors === 1 ? 1 : 0;
}

export { questionType };
export const isMulti = (section, n) => questionType(section, n) === 'multi';
export const maxFor = (section, n) => { const t = questionType(section, n); return t === 'multi' || t === 'match' ? 2 : 1; };

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
      const type = questionType(section, n);
      const pts = scoreQuestion(answers?.[section]?.[n] ?? '', k[n]?.a, type);
      const mx = maxFor(section, n);
      part.max += mx;
      if (pts === null) { complete = false; continue; }
      part.points += pts;
      if (pts === mx) part.correct++;
      else part.wrong.push({ n, marked: answers?.[section]?.[n] ?? '', key: k[n].a, points: pts, max: mx, type, topic: k[n].topic || '' });
    }
    total += part.points;
    max += part.max;
    parts[section] = part;
  }
  return { parts, total, max, complete, missing };
}
