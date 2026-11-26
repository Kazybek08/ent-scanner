// ИТОГИ ПРОБНИКА: рейтинг, пороги, средние по группам, анализ вопросов, динамика.
// Чистые функции (без экрана) — используются экраном «Результаты» и выгрузкой в Excel, покрыты автотестами.
import { evaluate } from './results.js';
import { maxFor } from './scoring.js';

export const PARTS = ['history', 'mathLit', 'reading', 'profile1', 'profile2'];
export const DEFAULT_THRESHOLDS = { total: 50, min: { history: 5, mathLit: 3, reading: 3, profile1: 5, profile2: 5 } };

/** Прошёл ли порог: весь балл известен, общий ≥ порога и каждый предмет ≥ минимума. */
export function passInfo(score, th = DEFAULT_THRESHOLDS) {
  if (!score || !score.complete) return { pass: null, fails: [] };
  const fails = [];
  if (score.total < th.total) fails.push('total');
  for (const p of PARTS) if ((score.parts[p].points ?? 0) < (th.min?.[p] ?? 0)) fails.push(p);
  return { pass: fails.length === 0, fails };
}

/** По одному бланку на ученика: последний скан. Бланки без ID — отдельными строками. */
function latestPerStudent(evs) {
  const by = new Map(), loose = [];
  for (const x of evs) {
    const id = x.ev.eff.studentId;
    if (!id) { loose.push(x); continue; }
    const cur = by.get(id);
    if (!cur || x.rec.createdAt > cur.rec.createdAt) by.set(id, x);
  }
  return [...by.values(), ...loose];
}

const collator = new Intl.Collator(['kk', 'ru'], { sensitivity: 'base', numeric: true });

/**
 * @param {object} p
 * @param {object} p.test, p.students, p.results    пробник, ученики, его бланки
 * @param {Array}  [p.combos]                        пары предметов из настроек
 * @param {object} [p.thresholds]
 * @param {Array}  [p.history]                       [{ test, results }] — все пробники для динамики
 */
export function buildReport({ test, students, results, combos = [], thresholds = DEFAULT_THRESHOLDS, history = [] }) {
  const ctx = { test, students, results, combos };
  const evs = results.filter(r => r.ok).map(rec => ({ rec, ev: evaluate(rec, ctx) }));
  const picked = latestPerStudent(evs);

  const rows = picked.map(({ rec, ev }) => {
    const pi = passInfo(ev.score, thresholds);
    return {
      recId: rec.id,
      id: ev.eff.studentId ?? ev.eff.studentIdRaw ?? '',
      name: ev.student?.name ?? '',
      group: ev.student?.group ?? '',
      lang: ev.student?.lang ?? '',
      variant: ev.eff.variant ?? ev.eff.variantRaw ?? '',
      profiles: ev.profiles ?? [null, null],
      parts: Object.fromEntries(PARTS.map(p => [p, ev.score ? ev.score.parts[p].points : null])),
      total: ev.score ? ev.score.total : null,
      complete: !!ev.score?.complete,
      pass: pi.pass, fails: pi.fails,
      flags: ev.flags.length, edited: ev.eff.edited,
      answers: ev.eff.answers,
      wrong: ev.score ? Object.fromEntries(PARTS.map(p => [p, ev.score.parts[p].wrong ?? []])) : {},
      duplicates: evs.filter(x => x.ev.eff.studentId && x.ev.eff.studentId === ev.eff.studentId).length - 1,
    };
  });
  rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || collator.compare(a.name || a.id, b.name || b.id));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = r.total === null ? null : rank; });

  // средние по группам (только полностью посчитанные бланки)
  const groupsMap = new Map();
  for (const r of rows.filter(r => r.complete)) {
    const g = groupsMap.get(r.group) ?? { group: r.group, count: 0, passed: 0, sum: Object.fromEntries(PARTS.map(p => [p, 0])), sumTotal: 0 };
    g.count++; if (r.pass) g.passed++;
    for (const p of PARTS) g.sum[p] += r.parts[p];
    g.sumTotal += r.total;
    groupsMap.set(r.group, g);
  }
  const avg = (s, n) => (n ? Math.round((s / n) * 10) / 10 : null);
  const groups = [...groupsMap.values()].sort((a, b) => collator.compare(a.group, b.group)).map(g => ({
    group: g.group, count: g.count, passed: g.passed,
    avg: Object.fromEntries(PARTS.map(p => [p, avg(g.sum[p], g.count)])), avgTotal: avg(g.sumTotal, g.count),
  }));
  const complete = rows.filter(r => r.complete);
  const summary = {
    sheets: rows.length, complete: complete.length,
    passed: complete.filter(r => r.pass).length,
    avgTotal: avg(complete.reduce((s, r) => s + r.total, 0), complete.length),
    avg: Object.fromEntries(PARTS.map(p => [p, avg(complete.reduce((s, r) => s + r.parts[p], 0), complete.length)])),
    best: complete[0] ?? null,
  };

  return { rows, groups, summary, questions: analyzeQuestions(rows, test), dynamics: buildDynamics(history, students, combos) };
}

/** Трудные вопросы: процент верных по каждому вопросу, самый частый неверный ответ, тема. */
export function analyzeQuestions(rows, test) {
  const stats = new Map();
  for (const r of rows) {
    if (!r.complete) continue;
    const key = test?.keys?.[r.variant];
    if (!key) continue;
    for (const part of PARTS) {
      const subject = part.startsWith('profile') ? r.profiles[part === 'profile1' ? 0 : 1] : part;
      const k = part.startsWith('profile') ? key.subjects?.[subject] : key[part];
      if (!k) continue;
      for (const [n, kq] of Object.entries(k)) {
        const id = `${r.variant}|${subject}|${n}`;
        const s = stats.get(id) ?? { variant: r.variant, subject, part, n: +n, key: kq.a, topic: kq.topic || '', answered: 0, correct: 0, points: 0, max: maxFor(part, +n), wrongCounts: {} };
        const marked = r.answers?.[part]?.[n]?.marked ?? '';
        s.answered++;
        const w = (r.wrong[part] ?? []).find(x => x.n === +n);
        const pts = w ? w.points : s.max;
        s.points += pts;
        if (pts === s.max) s.correct++;
        else if (marked) s.wrongCounts[marked] = (s.wrongCounts[marked] ?? 0) + 1;
        stats.set(id, s);
      }
    }
  }
  const list = [...stats.values()].map(s => {
    const common = Object.entries(s.wrongCounts).sort((a, b) => b[1] - a[1])[0];
    return { variant: s.variant, subject: s.subject, part: s.part, n: s.n, key: s.key, topic: s.topic, answered: s.answered,
      correctPct: Math.round((s.correct / s.answered) * 100), avgPoints: Math.round((s.points / s.answered) * 100) / 100,
      commonWrong: common ? common[0] : '', commonWrongCount: common ? common[1] : 0 };
  });
  list.sort((a, b) => a.correctPct - b.correctPct || a.subject.localeCompare(b.subject) || a.n - b.n);
  const hardest = new Set(list.filter(q => q.answered >= 3).slice(0, 10));
  for (const q of list) q.top10 = hardest.has(q);
  return list;
}

/** Динамика: общий балл каждого ученика по всем пробникам (по дате). */
export function buildDynamics(history, students, combos = []) {
  const tests = [...history].sort((a, b) => (a.test.date || '').localeCompare(b.test.date || '') || a.test.createdAt - b.test.createdAt);
  const table = new Map();
  tests.forEach(({ test, results }, ti) => {
    const ctx = { test, students, results, combos };
    const evs = results.filter(r => r.ok).map(rec => ({ rec, ev: evaluate(rec, ctx) }));
    for (const { ev } of latestPerStudent(evs)) {
      const id = ev.eff.studentId;
      if (!id || !ev.score?.complete) continue;
      const row = table.get(id) ?? { id, name: ev.student?.name ?? '', group: ev.student?.group ?? '', totals: Array(tests.length).fill(null) };
      row.totals[ti] = ev.score.total;
      table.set(id, row);
    }
  });
  const rows = [...table.values()].map(r => {
    const known = r.totals.map((v, i) => [v, i]).filter(([v]) => v !== null);
    const last = known.at(-1), before = known.at(-2);
    return { ...r, change: last && before ? last[0] - before[0] : null };
  }).sort((a, b) => collator.compare(a.group, b.group) || collator.compare(a.name, b.name));
  return { tests: tests.map(x => ({ id: x.test.id, name: x.test.name, date: x.test.date })), rows };
}
